import { z } from 'zod';
import { CurationIdSchema, LearningNoteIdSchema, RunIdSchema } from '../common/ids';
import { AssetRefSchema } from '../catalog/asset-kind';
import { RecipeRefSchema } from '../recipes/recipe';
import { BudgetSchema } from '../agents/packet-base';
import { UntrustedTextSchema } from '../agents/packet-parts';
import { CurationCheckIdSchema, CuratableKindSchema } from './enums';

/** Packet `task` literal of the Curator (topology 0004 section 5). */
export const CURATOR_PROPOSE_TASK = 'propose-version';

/** Packet `outputContract` literal of the Curator: the schema its answer is parsed with. */
export const CURATOR_OUTPUT_CONTRACT = 'CuratorOutput';

/**
 * Curator packet, copied field for field from topology 0004 section 5 (SPEC 0005 section 4.3).
 * `budget` is the v1 Budget: maxTokens 8,000, maxToolCalls 0, timeoutMs 120,000, maxUsd = $1.00
 * minus what this curation spent. On the corrective call only `attempt` and `budget` change;
 * `inputs`, `constraints`, `task` and `outputContract` stay byte-identical (SPEC 0005 L3, Q3).
 * Absent by construction (never sees): biometric assets and their notes, media bytes, credentials
 * and provider keys, raw session streams and event logs, retired notes and notes on other assets,
 * the owner's identity, session or login data.
 */
export const CuratorTaskPacketSchema = z
  .object({
    curationId: CurationIdSchema,
    /** 2 = the one corrective call. */
    attempt: z.number().int().min(1).max(2),
    budget: BudgetSchema,
    task: z.literal(CURATOR_PROPOSE_TASK),
    inputs: z
      .object({
        subject: z
          .object({
            ref: z.union([AssetRefSchema, RecipeRefSchema]),
            /** prompt | skill | recipe (text bodies only). */
            kind: CuratableKindSchema,
            title: z.string().max(200),
            status: z.enum(['draft', 'active']),
            /** The current text body or recipe definition JSON, delimited. */
            body: UntrustedTextSchema,
          })
          .strict(),
        outcomes: z
          .object({
            qualityScore: z.number().nullable(),
            sampleSize: z.number().int().min(0),
            formulaVersion: z.string(),
            /** The active version's score when the subject is a draft. */
            baselineScore: z.number().nullable(),
            /** Newest reviewed runs first. */
            runs: z
              .array(
                z
                  .object({
                    runId: RunIdSchema,
                    ownerRating: z.number().int().min(1).max(5).nullable(),
                    reviewerScore: z.number().nullable(),
                    qaOutcome: z.enum(['pass', 'fail', 'not-run']),
                    recoveries: z.number().int().min(0),
                    costUsd: z.number().min(0),
                    decision: z.enum(['approved', 'rejected', 'pending']),
                  })
                  .strict(),
              )
              .max(20),
          })
          .strict(),
        notes: z.array(z.object({ noteId: LearningNoteIdSchema, text: UntrustedTextSchema }).strict()).max(10),
        evidence: z
          .array(
            z
              .object({
                runId: RunIdSchema,
                /** Capped at 600 characters before delimiting. */
                reviewExcerpt: UntrustedTextSchema,
              })
              .strict(),
          )
          .max(5),
        /** The owner's request text, capped at 500 characters before delimiting. */
        ownerFocus: UntrustedTextSchema.optional(),
        /** The subject's last 3 declined proposals, newest first (topology 0004 section 6). */
        declinedProposals: z
          .array(
            z
              .object({
                curationId: CurationIdSchema,
                changeSummary: z.string().max(600),
                /** Capped at 300 characters before delimiting. */
                ownerReason: UntrustedTextSchema.optional(),
              })
              .strict(),
          )
          .max(3),
      })
      .strict(),
    constraints: z
      .object({
        /** The new version changes the body, nothing else. */
        bodyOnly: z.literal(true),
        maxBodyChars: z.literal(16_000),
        /** Every evidence run id is in `inputs.outcomes.runs`. */
        evidenceFromPacketOnly: z.literal(true),
      })
      .strict(),
    outputContract: z.literal(CURATOR_OUTPUT_CONTRACT),
  })
  .strict()
  .readonly();
export type CuratorTaskPacket = z.infer<typeof CuratorTaskPacketSchema>;

/**
 * The Curator's answer (topology 0004 section 5): the full new body, or `no-change`. `newBody` has
 * no length cap here on purpose: the ground check owns the 16,000-character rule (`body-within-cap`,
 * fixable), so an over-long body reaches the check instead of failing the schema.
 */
export const CuratorOutputSchema = z.discriminatedUnion('decision', [
  z
    .object({
      decision: z.literal('propose'),
      newBody: z.string().min(1),
      changeSummary: z.string().max(600),
      reason: z.string().max(1000),
      evidenceRunIds: z.array(RunIdSchema).min(1).max(5),
      expectedEffect: z.string().max(300),
      suggestComparison: z.boolean(),
    })
    .strict(),
  z
    .object({
      decision: z.literal('no-change'),
      /** Why the outcomes do not justify a new version. */
      reason: z.string().max(1000),
    })
    .strict(),
]);
export type CuratorOutput = z.infer<typeof CuratorOutputSchema>;

/**
 * The one corrective instruction of a second call, rendered in the system message after the cached
 * instructions (SPEC 0005 section 4.3, B11). `failedChecks` is empty for `schema`; `issues` holds
 * zod paths for `schema` and fixed sentences per check id for `ground-check`, never model text.
 */
export const CuratorCorrectionSchema = z
  .object({
    kind: z.enum(['schema', 'ground-check']),
    failedChecks: z.array(CurationCheckIdSchema).max(CurationCheckIdSchema.options.length),
    issues: z.array(z.string().max(300)).max(10),
  })
  .strict();
export type CuratorCorrection = z.infer<typeof CuratorCorrectionSchema>;
