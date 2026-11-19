import { z } from 'zod';
import { QaMetricsSchema } from '../run-format/qa';
import { ReviewSubjectSchema } from '../run-format/vocabulary';
import { packetBaseShape } from './packet-base';
import { OutputContractSchema, REVIEW_TASK, RunArtifactIdSchema } from './protocol';

/**
 * Reviewer packet (topology section 5). Evidence only: the engine postcondition decides pass.
 * Absent by construction: generator reasoning and session streams, past owner verdicts, credentials.
 */
export const ReviewPacketSchema = z
  .object({
    ...packetBaseShape,
    task: z.literal(REVIEW_TASK),
    inputs: z
      .object({
        subject: ReviewSubjectSchema,
        rubric: z.array(
          z
            .object({
              criterionId: z.string(),
              description: z.string(),
              weight: z.number(),
              threshold: z.number().min(1).max(5),
            })
            .strict(),
        ),
        briefSummary: z.string().max(1000),
        /** What to inspect through RunArtifactReadTool. */
        artifactIds: z.array(RunArtifactIdSchema),
        /** Render only: loudness, duration, caption timing. */
        qaMetrics: QaMetricsSchema.optional(),
      })
      .strict(),
    constraints: z
      .object({
        /** Every score cites an artifact or a timestamp. */
        evidenceRequired: z.literal(true),
        passDecisionIsEngines: z.literal(true),
      })
      .strict(),
    outputContract: z.literal(OutputContractSchema.enum.ReviewVerdict),
  })
  .strict()
  .readonly();
export type ReviewPacket = z.infer<typeof ReviewPacketSchema>;

/**
 * Reviewer answer. The refine is the same rule as the engine's evaluator-loop guard (topology
 * section 7): a retry needs both the flag and a non-blank instruction.
 */
export const ReviewVerdictSchema = z
  .object({
    scores: z.array(
      z
        .object({
          criterionId: z.string(),
          score: z.number().int().min(1).max(5),
          evidence: z.string().max(500),
          timestampsMs: z.array(z.number().int()).optional(),
        })
        .strict(),
    ),
    overall: z.number().min(1).max(5),
    blockingIssues: z.array(z.string().max(300)),
    retryRecommended: z.boolean(),
    retryInstruction: z.string(),
  })
  .strict()
  .refine((verdict) => !verdict.retryRecommended || verdict.retryInstruction.trim().length > 0, {
    message: 'retryInstruction must be non-empty when retryRecommended is true',
    path: ['retryInstruction'],
  });
export type ReviewVerdict = z.infer<typeof ReviewVerdictSchema>;
