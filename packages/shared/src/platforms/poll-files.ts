import { z } from 'zod';
import { IsoDateSchema, IsoDateTimeSchema, MetricBatchIdSchema, PublicationIdSchema } from '../common/ids';
import { PlatformSchema } from '../metrics/enums';
import { PlatformMetricsSchema } from '../metrics/snapshot';
import { metricBatchBounds, pollRules } from './constants';
import { PlatformModeSchema, PollStopReasonSchema } from './enums';

/*
 * Polling files under `<data home>/platform/` (SPEC 0007 sections 4.3, 4.6, 5.5 and 5.6). Numbers
 * only: no URL, title, caption or account label is written.
 */

/** One publication's poll progress. `platformMediaId` caches a resolved Instagram media id (section 5.5). */
export const PollCursorEntrySchema = z
  .object({
    lastPolledOn: IsoDateSchema.nullable(),
    stopped: PollStopReasonSchema.nullable(),
    strikes: z.number().int().min(0).max(pollRules.notFoundStrikes),
    platformMediaId: z.string().max(64).nullable(),
  })
  .strict();
export type PollCursorEntry = z.infer<typeof PollCursorEntrySchema>;

/** `platform/polls/cursor.json`; writer: the watcher only, between runs, after the batch file. */
export const PollCursorFileSchema = z
  .object({
    format: z.literal(1),
    updatedAt: IsoDateTimeSchema,
    entries: z.record(PublicationIdSchema, PollCursorEntrySchema),
  })
  .strict();
export type PollCursorFile = z.infer<typeof PollCursorFileSchema>;

/** One pulled row: the same `PlatformMetrics` shape the CSV import and the form produce. */
export const MetricBatchRowSchema = z
  .object({ publicationId: PublicationIdSchema, metrics: PlatformMetricsSchema })
  .strict();
export type MetricBatchRow = z.infer<typeof MetricBatchRowSchema>;

/**
 * `platform/metrics-inbox/<batchId>.json`: created once by the watcher (temp file, then link) and
 * deleted by `IngestMetricBatch` after its transaction commits; never edited (K2). `asOfDate` is
 * the local day of the pull (B11). Rule: one row per publication.
 */
export const MetricBatchFileSchema = z
  .object({
    format: z.literal(1),
    batchId: MetricBatchIdSchema,
    platform: PlatformSchema,
    mode: PlatformModeSchema,
    asOfDate: IsoDateSchema,
    pulledAt: IsoDateTimeSchema,
    rows: z.array(MetricBatchRowSchema).min(1).max(metricBatchBounds.maxRows),
  })
  .strict()
  .superRefine((batch, context) => {
    const seen = new Set<string>();
    batch.rows.forEach((row, index) => {
      if (seen.has(row.publicationId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rows', index, 'publicationId'],
          message: 'one row per publication',
        });
      }
      seen.add(row.publicationId);
    });
  });
export type MetricBatchFile = z.infer<typeof MetricBatchFileSchema>;
