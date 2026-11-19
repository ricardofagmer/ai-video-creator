import { type MetricImport, type Prisma, type RunPublication } from '@prisma/client';
import { MetricImportViewSchema, type MetricImportView } from '@studio/shared/api';
import { MetricSnapshotSchema, PublicationSchema, type MetricSnapshot, type Publication } from '@studio/shared/metrics';
import { metricColumnSelect, toPlatformMetrics } from './metric-columns.mapper';
import { MetricsRowCorruptError } from './metrics.errors';

/*
 * `run_publications`, `platform_metric_snapshots` and `metric_imports` rows to their shared
 * contracts. Every row is re-validated, so a row outside the contract never leaves the module; the
 * error names the table and the row id only.
 */

/** Every snapshot read selects the key, the source, the import id, the numbers and the time. */
export const snapshotSelect = {
  publicationId: true,
  asOfDate: true,
  source: true,
  importId: true,
  recordedAt: true,
  ...metricColumnSelect,
} as const satisfies Prisma.PlatformMetricSnapshotSelect;

export type SnapshotRow = Prisma.PlatformMetricSnapshotGetPayload<{ select: typeof snapshotSelect }>;

export function toPublication(row: RunPublication): Publication {
  const parsed = PublicationSchema.safeParse({
    publicationId: row.id,
    runId: row.runId,
    platform: row.platform,
    platformVideoId: row.platformVideoId,
    url: row.url,
    publishedOn: row.publishedOn,
    recordedBy: row.recordedBy,
    recordedAt: row.recordedAt.toISOString(),
  });
  if (!parsed.success) throw new MetricsRowCorruptError('run_publications', row.id);
  return parsed.data;
}

export function toMetricSnapshot(row: SnapshotRow): MetricSnapshot {
  const corrupt = (): MetricsRowCorruptError => new MetricsRowCorruptError('platform_metric_snapshots', `${row.publicationId}/${row.asOfDate}/${row.source}`);
  const parsed = MetricSnapshotSchema.safeParse({
    publicationId: row.publicationId,
    asOfDate: row.asOfDate,
    source: row.source,
    importId: row.importId,
    metrics: toPlatformMetrics(row, corrupt),
    recordedAt: row.recordedAt.toISOString(),
  });
  if (!parsed.success) throw corrupt();
  return parsed.data;
}

export function toMetricImportView(row: MetricImport): MetricImportView {
  const parsed = MetricImportViewSchema.safeParse({
    importId: row.id,
    platform: row.platform,
    asOfDate: row.asOfDate,
    fileBytes: row.fileBytes,
    rows: row.rows,
    matched: row.matched,
    created: row.created,
    updated: row.updated,
    unchanged: row.unchanged,
    unmatched: row.unmatched,
    issues: row.issues,
    importedBy: row.importedBy,
    importedAt: row.importedAt.toISOString(),
  });
  if (!parsed.success) throw new MetricsRowCorruptError('metric_imports', row.id);
  return parsed.data;
}
