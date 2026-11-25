import { ReviewVerdictSchema } from '@studio/shared/agents';
import { AssetRefSchema, SensitivitySchema } from '@studio/shared/catalog';
import { z } from 'zod';

/**
 * Watcher-local shapes of the stage artifacts C3 does not freeze (research, claims, captures,
 * narration) and of the stages' sidecars. C7 tools read some of them as run artifacts by output
 * name; the `captures-index` entry carries the run-relative `path` and optional `sensitivity`
 * R1-13's FrameSampleTool reads (`packages/core/src/agents/tools/frame-sample.tool.ts`).
 */

const relativePath = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => !value.startsWith('/') && !value.split('/').includes('..'), 'expected a run-relative path');

/** Claim ids fit C3 `claim-without-evidence.claimIds` (64 characters). */
const ClaimIdSchema = z.string().regex(/^claim-[0-9]{1,3}$/);

export const ResearchArtifactSchema = z
  .object({
    format: z.literal(1),
    mode: z.enum(['mock', 'live', 'no-source']),
    sourceUrl: z.string().max(2048).nullable(),
    title: z.string().max(500),
    /** Visible page text; untrusted, delimited by the packet builders before any agent sees it. */
    text: z.string().max(200_000),
    truncated: z.boolean(),
  })
  .strict();
export type ResearchArtifact = z.infer<typeof ResearchArtifactSchema>;

const EvidenceSpanSchema = z
  .object({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative(), excerpt: z.string().max(600) })
  .strict();
export type EvidenceSpan = z.infer<typeof EvidenceSpanSchema>;

const ClaimRecordSchema = z
  .object({
    claimId: ClaimIdSchema,
    statement: z.string().min(1).max(300),
    status: z.enum(['verified', 'unverified']),
    evidence: EvidenceSpanSchema.nullable(),
    /** `research:<start>-<end>`, the span inside the research text. */
    evidenceRef: z.string().max(64).nullable(),
  })
  .strict();
export type ClaimRecord = z.infer<typeof ClaimRecordSchema>;

export const ClaimsArtifactSchema = z.object({ format: z.literal(1), claims: z.array(ClaimRecordSchema).max(50) }).strict();
export type ClaimsArtifact = z.infer<typeof ClaimsArtifactSchema>;

const CaptureEntrySchema = z
  .object({
    captureId: z.string().regex(/^capture-[0-9]{1,3}$/),
    label: z.string().max(200),
    durationMs: z.number().int().positive(),
    path: relativePath,
    mimeType: z.enum(['video/mp4', 'video/webm']),
    /** Owner default (R1-13): captures of the brief's page are `normal`; absent reads as normal. */
    sensitivity: SensitivitySchema.optional(),
  })
  .strict();
export type CaptureEntry = z.infer<typeof CaptureEntrySchema>;

export const CapturesIndexSchema = z
  .object({
    format: z.literal(1),
    mode: z.enum(['mock', 'live', 'no-source']),
    sourceUrl: z.string().max(2048).nullable(),
    captures: z.array(CaptureEntrySchema).max(500),
  })
  .strict();
export type CapturesIndex = z.infer<typeof CapturesIndexSchema>;

const wordTiming = z.object({ text: z.string().max(200), startS: z.number().nonnegative(), endS: z.number().nonnegative() }).strict();

export const NarrationIndexSchema = z
  .object({
    format: z.literal(1),
    engine: z.enum(['mock', 'elevenlabs', 'local-voice']),
    durationS: z.number().positive(),
    /** Run-relative path of the assembled narration audio (declared output `narration-audio`). */
    audioPath: relativePath,
    sceneTimings: z.array(z.object({ sceneId: z.string().max(64), startS: z.number(), endS: z.number() }).strict()).max(100),
    words: z.array(wordTiming).max(20_000),
    characters: z.number().int().nonnegative(),
  })
  .strict();
export type NarrationIndex = z.infer<typeof NarrationIndexSchema>;

/** Sidecar of `plan`: the engine's PlanRecorder always records `source: planner`. */
export const PlanSourceSchema = z
  .object({ format: z.literal(1), source: z.enum(['planner', 'recipe-default']), warning: z.string().max(500).nullable() })
  .strict();

/**
 * Reviewer outcome of one subject, declared in the generating stage's folder. A Reviewer failure
 * degrades to `unavailable` (topology section 9), so the verdict cannot be the declared output
 * itself; `package` copies recorded verdicts to `qa/review-<subject>.json`.
 */
export const ReviewOutcomeSchema = z.discriminatedUnion('status', [
  z.object({ format: z.literal(1), status: z.literal('recorded'), revisions: z.number().int().min(0).max(5), verdict: ReviewVerdictSchema }).strict(),
  z.object({ format: z.literal(1), status: z.literal('unavailable'), revisions: z.number().int().min(0).max(5), reason: z.string().max(500) }).strict(),
]);
export type ReviewOutcome = z.infer<typeof ReviewOutcomeSchema>;

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const pickReason = z.string().min(1).max(300);

/**
 * Sidecar of `music` in auto mode (docs/specs/2026-11-25-ai-music-choice-design.md section 3.5):
 * which song the video carries and why. A rerun of the same run reuses it while it still resolves.
 */
export const MusicPickRecordSchema = z.discriminatedUnion('source', [
  z.object({ format: z.literal(1), source: z.literal('catalog'), ref: AssetRefSchema, contentHash: sha256, reason: pickReason }).strict(),
  z
    .object({
      format: z.literal(1),
      source: z.literal('generated'),
      ref: z.literal('generated'),
      contentHash: sha256,
      reason: pickReason,
      engine: z.enum(['mock', 'elevenlabs']),
      /** Run-relative path of the generated track (declared output `music-track`). */
      path: relativePath,
      lengthMs: z.number().int().positive(),
    })
    .strict(),
]);
export type MusicPickRecord = z.infer<typeof MusicPickRecordSchema>;

/** Which file the QA media review measured, so `package` ships exactly that file. */
export const QaSubjectSchema = z
  .object({ format: z.literal(1), path: relativePath, contentHash: z.string().regex(/^[a-f0-9]{64}$/), passed: z.boolean() })
  .strict();
