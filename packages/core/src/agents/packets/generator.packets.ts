import {
  DIRECTOR_ROLE,
  DIRECT_SCENES_TASK,
  DirectorPacketSchema,
  OutputContractSchema,
  WRITER_ROLE,
  WRITE_SCRIPT_TASK,
  WriterPacketSchema,
  type BrandKitSummary,
  type CameraMove,
  type DirectorPacket,
  type ScenesOutput,
  type ScriptOutput,
  type Transition,
  type WriterPacket,
} from '@studio/shared/agents';
import { type JsonObject } from '@studio/shared/catalog';
import { type Brief, type Recipe } from '@studio/shared/recipes';
import {
  bindingSummaries,
  delimitAssetText,
  delimitUntrusted,
  packetBaseFor,
  packetLearnings,
  type AssetText,
  type BoundAssetSummary,
  type BriefLearnings,
  type PacketCoordinates,
} from './packet-support';

/** Captured-page text of one verified claim (toolbox `verify`); untrusted. */
export interface VerifiedClaim {
  readonly claimId: string;
  readonly text: string;
  readonly evidenceRef: string;
}

/** Reviewer feedback for a revision (attempt > 1 only, topology section 7 evaluator loop). */
export interface Revision<Output> {
  readonly instruction: string;
  readonly previousOutput: Output;
}

const CLAIM_TEXT_MAX_CHARS = 2000;
const RETRY_INSTRUCTION_MAX_CHARS = 2000;
const CAPTURE_LABEL_MAX_CHARS = 200;

function revisionFields<Output>(revision: Revision<Output> | undefined): { retryInstruction?: string; previousOutput?: Output } {
  if (revision === undefined) return {};
  return { retryInstruction: revision.instruction.slice(0, RETRY_INSTRUCTION_MAX_CHARS), previousOutput: revision.previousOutput };
}

export interface WriterPacketSource {
  readonly coordinates: PacketCoordinates;
  readonly brief: Brief;
  readonly verifiedClaims: readonly VerifiedClaim[];
  /** The bound template version's props schema. */
  readonly templateInputSchema: JsonObject;
  readonly prompt: AssetText;
  readonly skill?: AssetText;
  /** Brand-kit tone section. */
  readonly brandVoice?: AssetText;
  readonly format: Pick<Recipe['format'], 'narration' | 'sceneCount'>;
  /** The stage brief's `learnings` (`stageBrief.learnings ?? []`); never notes read here. */
  readonly learnings: BriefLearnings;
  readonly revision?: Revision<ScriptOutput>;
}

/**
 * Scriptwriter packet (topology section 5). Never sees (section 2): the cost ledger and other
 * stages' session streams (no source field carries them), biometric assets (only text versions
 * of prompt, skill and brand kit are read), credentials; and (topology 0004 section 2) retired
 * notes, notes after the run's cutoff and notes on biometric versions, which the brief step
 * already filtered out. Catalog texts, claim texts and note texts are delimited with embedded
 * tags escaped (section 8).
 */
export function buildWriterPacket(source: WriterPacketSource): WriterPacket {
  return WriterPacketSchema.parse({
    ...packetBaseFor(WRITER_ROLE, source.coordinates),
    task: WRITE_SCRIPT_TASK,
    inputs: {
      brief: source.brief,
      verifiedClaims: source.verifiedClaims.map((claim) => ({
        claimId: claim.claimId,
        text: delimitUntrusted(claim.text, { attributes: { id: claim.claimId }, maxChars: CLAIM_TEXT_MAX_CHARS, overflow: 'truncate' }),
        evidenceRef: claim.evidenceRef,
      })),
      templateInputSchema: source.templateInputSchema,
      promptText: delimitAssetText(source.prompt),
      ...(source.skill === undefined ? {} : { skillText: delimitAssetText(source.skill) }),
      ...(source.brandVoice === undefined ? {} : { brandVoice: delimitAssetText(source.brandVoice) }),
      targetDurationSec: source.brief.targetDurationSec,
      language: source.brief.language,
      ...revisionFields(source.revision),
      learnings: packetLearnings(source.learnings),
    },
    constraints: {
      claimsOnly: true,
      maxWordsPerSecond: source.format.narration.maxWordsPerSecond,
      sceneCount: source.format.sceneCount,
    },
    outputContract: OutputContractSchema.enum.ScriptOutput,
  });
}

/** One entry of the captures index (toolbox `capture`); labels come from captured pages. */
export interface CaptureSummary {
  readonly captureId: string;
  readonly label: string;
  readonly durationMs: number;
}

export interface DirectorPacketSource {
  readonly coordinates: PacketCoordinates;
  /** The approved script output only, never the Scriptwriter session. */
  readonly script: ScriptOutput;
  readonly capturesIndex: readonly CaptureSummary[];
  readonly templateSceneSchema: JsonObject;
  readonly boundAssets: readonly BoundAssetSummary[];
  readonly brandKit: BrandKitSummary;
  /** The template's allowed ids, narrowed for this call. */
  readonly cameraMoves: readonly CameraMove[];
  readonly transitions: readonly Transition[];
  /** The stage brief's `learnings` (`stageBrief.learnings ?? []`); never notes read here. */
  readonly learnings: BriefLearnings;
  readonly revision?: Revision<ScenesOutput>;
}

/**
 * Scene director packet (topology section 5). Never sees (section 2): the cost ledger,
 * Scriptwriter reasoning (only the validated `ScriptOutput` is copied, never a session), biometric
 * assets (`bindingSummaries` drops them from `offeredRefs`), credentials; and the notes the
 * brief step filtered out (topology 0004 section 2). Note texts are delimited like the writer's.
 */
export function buildDirectorPacket(source: DirectorPacketSource): DirectorPacket {
  return DirectorPacketSchema.parse({
    ...packetBaseFor(DIRECTOR_ROLE, source.coordinates),
    task: DIRECT_SCENES_TASK,
    inputs: {
      script: source.script,
      capturesIndex: source.capturesIndex.map((capture) => ({
        captureId: capture.captureId,
        label: capture.label.slice(0, CAPTURE_LABEL_MAX_CHARS),
        durationMs: capture.durationMs,
      })),
      templateSceneSchema: source.templateSceneSchema,
      offeredRefs: bindingSummaries(source.boundAssets),
      brandKit: source.brandKit,
      ...revisionFields(source.revision),
      learnings: packetLearnings(source.learnings),
    },
    constraints: {
      citeOnlyOfferedRefs: true,
      cameraMoves: [...source.cameraMoves],
      transitions: [...source.transitions],
    },
    outputContract: OutputContractSchema.enum.ScenesOutput,
  });
}
