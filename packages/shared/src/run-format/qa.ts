import { z } from 'zod';
import { IsoDateTimeSchema, RelativePathSchema, RunIdSchema } from '../common/ids';
import { CheckResultSchema } from './stage-files';
import { ReviewSubjectSchema } from './vocabulary';

/**
 * Measured properties of the rendered video (PRD 7.3 checks). Also the `qa-metrics` run artifact
 * and the ReviewPacket `qaMetrics` input (topology section 5).
 */
export const QaMetricsSchema = z
  .object({
    container: z.string().max(40),
    videoCodec: z.string().max(40),
    durationMs: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.number().positive(),
    audio: z.discriminatedUnion('status', [
      z
        .object({
          status: z.literal('present'),
          codec: z.string().max(40),
          integratedLufs: z.number().min(-99).max(10),
          truePeakDbtp: z.number().min(-99).max(20),
        })
        .strict(),
      z.object({ status: z.literal('absent') }).strict(),
    ]),
    blackRuns: z
      .array(z.object({ startMs: z.number().int().nonnegative(), durationMs: z.number().int().nonnegative() }).strict())
      .max(1000),
    /** Largest caption-to-narration drift; null when the run has no captions. */
    captionMaxDriftMs: z.number().int().nonnegative().nullable(),
  })
  .strict();
export type QaMetrics = z.infer<typeof QaMetricsSchema>;

/** A Reviewer verdict recorded as evidence, or the degraded case of topology section 9. */
export const QaReviewSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('recorded'),
      subject: ReviewSubjectSchema,
      overall: z.number().min(1).max(5),
      /** `qa/review-<subject>.json`, a C7 ReviewVerdict. */
      verdictPath: RelativePathSchema,
    })
    .strict(),
  z.object({ status: z.literal('unavailable'), subject: ReviewSubjectSchema, reason: z.string().max(500) }).strict(),
]);
export type QaReview = z.infer<typeof QaReviewSchema>;

/**
 * `runs/<runId>/qa/summary.json`: the QA evidence index the review screen reads. A run reaches
 * `review` only when every media check passed, so the outcome is never "failed".
 */
export const QaSummarySchema = z
  .object({
    runId: RunIdSchema,
    createdAt: IsoDateTimeSchema,
    outcome: z.enum(['passed', 'passed-with-warnings']),
    metrics: QaMetricsSchema,
    checks: z.array(CheckResultSchema).max(500),
    reviews: z.array(QaReviewSchema).max(20),
    /** pt-BR warnings for the owner, e.g. a degraded Reviewer or a recovered step. */
    warnings: z.array(z.string().max(500)).max(50),
  })
  .strict();
export type QaSummary = z.infer<typeof QaSummarySchema>;
