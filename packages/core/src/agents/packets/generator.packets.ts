import {
  DIRECTOR_ROLE,
  DIRECT_SCENES_TASK,
  DirectorPacketSchema,
  MUSIC_CANDIDATES_MAX,
  OutputContractSchema,
  REFERENCE_ANALYSES_MAX,
  WRITER_ROLE,
  WRITE_SCRIPT_TASK,
  WriterPacketSchema,
  untrustedTextMaxChars,
  type BrandKitSummary,
  type CameraMove,
  type DirectorPacket,
  type MusicCandidate,
  type ReferenceAnalysisEntry,
  type ScenesOutput,
  type ScriptOutput,
  type SiteAnalysis,
  type Transition,
  type WriterPacket,
} from '@studio/shared/agents';
import { type JsonObject, type MusicCategory } from '@studio/shared/catalog';
import { BRIEF_INSTRUCTIONS_MAX, type Brief, type Recipe } from '@studio/shared/recipes';
import {
  bindingSummaries,
  delimitAssetText,
  delimitUntrusted,
  packetBaseFor,
  packetLearnings,
  skillTextsField,
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

/**
 * The research stage's site analysis as one delimited JSON block, or nothing when there is none.
 * The analysis is model output about a third-party page, so it reaches later agents as data only.
 */
function siteAnalysisField(siteAnalysis: SiteAnalysis | undefined): { siteAnalysis?: string } {
  if (siteAnalysis === undefined) return {};
  return {
    siteAnalysis: delimitUntrusted(JSON.stringify(siteAnalysis), {
      attributes: { id: 'site-analysis' },
      maxChars: untrustedTextMaxChars,
      overflow: 'truncate',
    }),
  };
}

/**
 * The kept style analyses of the run's video references as one delimited JSON block, or nothing
 * when there are none. They are model output about third-party videos, so they reach the writer and
 * director as data only, exactly like the site analysis; an over-long block is cut after escaping
 * so it always fits `UntrustedTextSchema`.
 */
function referenceAnalysesField(referenceAnalyses: readonly ReferenceAnalysisEntry[] | undefined): { referenceAnalyses?: string } {
  if (referenceAnalyses === undefined || referenceAnalyses.length === 0) return {};
  return {
    referenceAnalyses: delimitUntrusted(JSON.stringify(referenceAnalyses.slice(0, REFERENCE_ANALYSES_MAX)), {
      attributes: { id: 'reference-analyses' },
      maxChars: untrustedTextMaxChars,
      overflow: 'truncate',
    }),
  };
}

/**
 * How many of the run's references reach the writer and the director. Raised from 8 when the wizard
 * began adding prompts, skills and media beside the references; the block is still cut by size.
 */
export const OWNER_REFERENCES_MAX = 16;
/** Longest content of one text reference that reaches a packet. */
export const OWNER_REFERENCE_TEXT_MAX_CHARS = 6000;

/** One reference the owner put on the run, as the writer and the director receive it. */
export interface OwnerReferenceNote {
  readonly ref: string;
  readonly name: string;
  readonly subKind: string;
  /** The owner's `referenceNotes`; may be empty. */
  readonly notes: string;
  /** Content of a text reference, already cut to `OWNER_REFERENCE_TEXT_MAX_CHARS`. */
  readonly text?: string;
}

/**
 * The run's references (any sub-kind) as one delimited JSON block, or nothing when there are none.
 * Owner notes and third-party text, so data only; an over-long block is cut after escaping.
 */
function ownerReferencesField(ownerReferences: readonly OwnerReferenceNote[] | undefined): { ownerReferences?: string } {
  if (ownerReferences === undefined || ownerReferences.length === 0) return {};
  return {
    ownerReferences: delimitUntrusted(JSON.stringify(ownerReferences.slice(0, OWNER_REFERENCES_MAX)), {
      attributes: { id: 'owner-references' },
      maxChars: untrustedTextMaxChars,
      overflow: 'truncate',
    }),
  };
}

export interface WriterPacketSource {
  readonly coordinates: PacketCoordinates;
  readonly brief: Brief;
  readonly verifiedClaims: readonly VerifiedClaim[];
  /** The bound template version's props schema. */
  readonly templateInputSchema: JsonObject;
  readonly prompt: AssetText;
  /** Bound `skill:writer` entry texts, in binding order (at most `WRITER_SKILLS_MAX`). */
  readonly skills?: readonly AssetText[];
  /** Brand-kit tone section. */
  readonly brandVoice?: AssetText;
  readonly format: Pick<Recipe['format'], 'narration' | 'sceneCount'>;
  /** Longest narration composition accepts: the bound template's `duration.maxSec`; absent with no template. */
  readonly narrationCeilingSec?: number;
  /** The stage brief's `learnings` (`stageBrief.learnings ?? []`); never notes read here. */
  readonly learnings: BriefLearnings;
  readonly revision?: Revision<ScriptOutput>;
  /** The research stage's `site-analysis` output, when the run has one. */
  readonly siteAnalysis?: SiteAnalysis;
  /** The `script` stage's `reference-analyses` entries (at most `REFERENCE_ANALYSES_MAX`), when the run has any. */
  readonly referenceAnalyses?: readonly ReferenceAnalysisEntry[];
  /** The run's references of any sub-kind (at most `OWNER_REFERENCES_MAX`), when the run has any. */
  readonly ownerReferences?: readonly OwnerReferenceNote[];
}

/**
 * Share of the narration ceiling the Scriptwriter may aim at. Spoken narration ran up to 17% over
 * the script's estimate (pauses between scenes, voice pace), and composition refuses a narration
 * longer than the template allows, so the target keeps that margin below the ceiling.
 */
const NARRATION_CEILING_SHARE = 0.85;

/** The duration the Scriptwriter aims at: the brief's target, held below the narration ceiling. */
export function writerTargetSec(briefTargetSec: number, narrationCeilingSec: number | undefined): number {
  if (narrationCeilingSec === undefined) return briefTargetSec;
  return Math.max(1, Math.min(briefTargetSec, Math.floor(narrationCeilingSec * NARRATION_CEILING_SHARE)));
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
      ...skillTextsField(source.skills),
      ...(source.brandVoice === undefined ? {} : { brandVoice: delimitAssetText(source.brandVoice) }),
      targetDurationSec: writerTargetSec(source.brief.targetDurationSec, source.narrationCeilingSec),
      language: source.brief.language,
      ...revisionFields(source.revision),
      learnings: packetLearnings(source.learnings),
      ...siteAnalysisField(source.siteAnalysis),
      ...referenceAnalysesField(source.referenceAnalyses),
      ...ownerReferencesField(source.ownerReferences),
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

// Room for the delimiter wrapper and escaped tags, so the owner's 2,000 characters are never cut.
const OWNER_INSTRUCTIONS_MAX_CHARS = BRIEF_INSTRUCTIONS_MAX * 2;

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
  /** The run brief's `instructions` (the owner's own words); delimited before it reaches the packet. */
  readonly ownerInstructions?: string;
  /** The research stage's `site-analysis` output, when the run has one. */
  readonly siteAnalysis?: SiteAnalysis;
  /** The `script` stage's `reference-analyses` entries (at most `REFERENCE_ANALYSES_MAX`), when the run has any. */
  readonly referenceAnalyses?: readonly ReferenceAnalysisEntry[];
  /** The run's references of any sub-kind (at most `OWNER_REFERENCES_MAX`), when the run has any. */
  readonly ownerReferences?: readonly OwnerReferenceNote[];
  /**
   * The music stage's candidates when the preset's music mode is `auto`
   * (docs/specs/2026-11-25-ai-music-choice-design.md, implementation amendments).
   */
  readonly music?: { readonly categories: readonly MusicCategory[]; readonly candidates: readonly MusicCandidate[] };
  /** Bound skill texts for the director (its slot, else every skill of the recipe); absent when none. */
  readonly skills?: readonly AssetText[];
}

/**
 * The director's background-music choice, or nothing. One candidate needs no pick (the music stage
 * uses it directly), so the block only reaches the packet with two or more; the list is capped so
 * a large catalog never overflows the packet schema.
 */
function musicField(music: DirectorPacketSource['music']): Pick<DirectorPacket['inputs'], 'music'> {
  if (music === undefined || music.candidates.length < 2) return {};
  return {
    music: {
      categories: [...music.categories],
      candidates: music.candidates.slice(0, MUSIC_CANDIDATES_MAX).map((candidate) => ({ ...candidate })),
    },
  };
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
      ...(source.ownerInstructions === undefined
        ? {}
        : { ownerInstructions: delimitUntrusted(source.ownerInstructions, { maxChars: OWNER_INSTRUCTIONS_MAX_CHARS, overflow: 'truncate' }) }),
      ...revisionFields(source.revision),
      learnings: packetLearnings(source.learnings),
      ...siteAnalysisField(source.siteAnalysis),
      ...referenceAnalysesField(source.referenceAnalyses),
      ...ownerReferencesField(source.ownerReferences),
      ...musicField(source.music),
      ...skillTextsField(source.skills),
    },
    constraints: {
      citeOnlyOfferedRefs: true,
      cameraMoves: [...source.cameraMoves],
      transitions: [...source.transitions],
    },
    outputContract: OutputContractSchema.enum.ScenesOutput,
  });
}
