import { z } from 'zod';
import { IsoDateSchema, IsoDateTimeSchema, MetricImportIdSchema, PublicationIdSchema } from '../common/ids';
import { MetricSourceSchema } from './enums';

const metricCount = z.number().int().min(0).max(1e12).nullable();

/**
 * The one shared outcome shape (SPEC 0006 section 5.2): cumulative totals as of the snapshot's
 * `asOfDate`. `views` is required because it is the only metric all three platforms report.
 * `averageViewPercent` may exceed 100 because loops count.
 */
export const PlatformMetricsSchema = z
  .object({
    views: z.number().int().min(0).max(1e12),
    likes: metricCount,
    comments: metricCount,
    shares: metricCount,
    saves: metricCount,
    impressions: metricCount,
    reach: metricCount,
    followersGained: metricCount,
    watchTimeSeconds: metricCount,
    averageViewDurationSeconds: z.number().min(0).max(86_400).nullable(),
    averageViewPercent: z.number().min(0).max(1000).nullable(),
  })
  .strict();
export type PlatformMetrics = z.infer<typeof PlatformMetricsSchema>;

/** The canonical metric names a platform profile maps CSV columns to. */
export type MetricName = keyof PlatformMetrics;

/**
 * One `platform_metric_snapshots` row. Keyed `(publicationId, asOfDate, source)`.
 * Rule: `importId` is null exactly when `source` is `form`.
 */
export const MetricSnapshotSchema = z
  .object({
    publicationId: PublicationIdSchema,
    /** The day the numbers describe (cumulative to that day), stated by the owner (B11). */
    asOfDate: IsoDateSchema,
    source: MetricSourceSchema,
    importId: MetricImportIdSchema.nullable(),
    metrics: PlatformMetricsSchema,
    recordedAt: IsoDateTimeSchema,
  })
  .strict()
  .superRefine((snapshot, context) => {
    if ((snapshot.source === 'form') !== (snapshot.importId === null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['importId'],
        message: 'importId is null exactly when source is form',
      });
    }
  });
export type MetricSnapshot = z.infer<typeof MetricSnapshotSchema>;

/**
 * `(likes + comments + shares + saves) / views`, with a null count read as 0; null when `views` is
 * 0. Derived on read and never stored (section 5.2).
 */
export function engagementRate(metrics: PlatformMetrics): number | null {
  if (metrics.views === 0) return null;
  const interactions = (metrics.likes ?? 0) + (metrics.comments ?? 0) + (metrics.shares ?? 0) + (metrics.saves ?? 0);
  return interactions / metrics.views;
}

/**
 * The snapshot in force for one publication: the latest `asOfDate`; on a tie `form` wins over
 * `csv`, because the owner typed it on purpose (B4). Null when the list is empty.
 */
export function selectSnapshotInForce<Snapshot extends Pick<MetricSnapshot, 'asOfDate' | 'source'>>(
  snapshots: readonly Snapshot[],
): Snapshot | null {
  let inForce: Snapshot | null = null;
  for (const snapshot of snapshots) {
    if (inForce === null || snapshot.asOfDate > inForce.asOfDate) {
      inForce = snapshot;
    } else if (snapshot.asOfDate === inForce.asOfDate && snapshot.source === 'form' && inForce.source === 'csv') {
      inForce = snapshot;
    }
  }
  return inForce;
}
