import {
  PACKET_LEARNINGS_MAX_ENTRIES,
  UNTRUSTED_TAG,
  agentBounds,
  escapeDelimiterTags,
  untrustedTextMaxChars,
  wrapDelimited,
  type BindingSummary,
  type LearningNotesBlock,
  type ModelRoleName,
  type PacketBase,
} from '@studio/shared/agents';
import { type AssetKind, type AssetRef, type Sensitivity } from '@studio/shared/catalog';
import { type BindingSlot } from '@studio/shared/recipes';
import { type RunId, type StageBrief, type StageId } from '@studio/shared/run-format';

/** Where the call sits in the run; the engine binds these, never a model (topology section 5). */
export interface PacketCoordinates {
  readonly runId: RunId;
  readonly stageId: StageId;
  readonly attempt: number;
}

/** `PacketBase` with the role's topology section 7 budget copied verbatim. */
export function packetBaseFor(role: ModelRoleName, coordinates: PacketCoordinates): PacketBase {
  const bounds = agentBounds[role];
  return {
    runId: coordinates.runId,
    stageId: coordinates.stageId,
    attempt: coordinates.attempt,
    budget: { maxTokens: bounds.maxTokens, maxToolCalls: bounds.maxToolCalls, timeoutMs: bounds.timeoutMs, maxUsd: bounds.maxUsd },
  };
}

/** A recipe binding with its catalog facts, as the engine resolved it. No bytes, no path. */
export interface BoundAssetSummary {
  readonly slot: BindingSlot;
  readonly ref: AssetRef;
  readonly kind: AssetKind;
  readonly title: string;
  readonly sensitivity: Sensitivity;
}

const BINDING_TITLE_MAX_CHARS = 200;

/** Topology section 2 "never sees" biometric assets: biometric rows are dropped here. */
export function bindingSummaries(boundAssets: readonly BoundAssetSummary[]): BindingSummary[] {
  return boundAssets
    .filter((asset) => asset.sensitivity !== 'biometric')
    .map((asset) => ({ slot: asset.slot, ref: asset.ref, kind: asset.kind, title: asset.title.slice(0, BINDING_TITLE_MAX_CHARS) }));
}

/** The text of a bound catalog version (prompt, skill, brand-kit tone); untrusted data. */
export interface AssetText {
  readonly ref: AssetRef;
  readonly text: string;
}

export class UntrustedTextTooLongError extends Error {
  readonly category = 'validation';

  constructor(
    readonly ref: string,
    readonly maxChars: number,
  ) {
    super(`Bound text ${ref} exceeds ${maxChars} characters once delimited; shorten the catalog version`);
    this.name = 'UntrustedTextTooLongError';
  }
}

/** Room taken by the tags and one attribute (`<untrusted ref="...">` and `</untrusted>`). */
function wrapperLength(attributes: Readonly<Record<string, string>>): number {
  return wrapDelimited(UNTRUSTED_TAG, '', attributes).length;
}

/**
 * Wraps untrusted text in one `<untrusted>` block with every embedded protocol tag escaped
 * (topology section 8). `truncate` caps captured or tool-derived text to `maxChars` in total;
 * `refuse` is for owner-curated catalog text, where a silent cut would change the instructions
 * the owner versioned.
 */
export function delimitUntrusted(
  text: string,
  options: { attributes?: Readonly<Record<string, string>>; maxChars: number; overflow: 'truncate' | 'refuse' },
): string {
  const attributes = options.attributes ?? {};
  const escaped = escapeDelimiterTags(text);
  const room = options.maxChars - wrapperLength(attributes);
  if (escaped.length <= room) return wrapDelimited(UNTRUSTED_TAG, escaped, attributes);
  if (options.overflow === 'refuse' || room <= 0) throw new UntrustedTextTooLongError(attributes['ref'] ?? 'text', options.maxChars);
  return wrapDelimited(UNTRUSTED_TAG, escaped.slice(0, room), attributes);
}

/** A bound catalog text as the C7 `UntrustedText` of a packet. */
export function delimitAssetText(asset: AssetText): string {
  return delimitUntrusted(asset.text, { attributes: { ref: asset.ref }, maxChars: untrustedTextMaxChars, overflow: 'refuse' });
}

/** Bound skills as one delimited block each, or nothing; the owner's versioned text is never cut. */
export function skillTextsField(skills: readonly AssetText[] | undefined): { skillTexts?: string[] } {
  if (skills === undefined || skills.length === 0) return {};
  return { skillTexts: skills.map(delimitAssetText) };
}

/** `StageBrief.learnings` as the brief step wrote it: per ref, capped and cut off (R2-07). */
export type BriefLearnings = NonNullable<StageBrief['learnings']>;

/**
 * Topology 0004 section 5 `learnings` of the writer and director packets (SPEC 0005 section 5.6,
 * L6): the brief's per-ref groups flattened to `{ref, noteId, text}`, refs in brief order and
 * notes newest first, each text one `<untrusted ref note>` block; `sourceRunId` and `slot` are
 * dropped. The brief is already capped by `capLearningsForBrief` (10 per ref, 4,000 characters);
 * the slice only keeps the packet schema's 64-entry bound, which many short notes could pass.
 */
export function packetLearnings(learnings: BriefLearnings): LearningNotesBlock {
  return learnings
    .flatMap((entry) =>
      entry.notes.map((note) => ({
        ref: entry.ref,
        noteId: note.noteId,
        text: delimitUntrusted(note.text, {
          attributes: { ref: entry.ref, note: note.noteId },
          maxChars: untrustedTextMaxChars,
          overflow: 'refuse',
        }),
      })),
    )
    .slice(0, PACKET_LEARNINGS_MAX_ENTRIES);
}
