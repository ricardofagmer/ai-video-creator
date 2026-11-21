import { type MetricImport, type Prisma, type RunPublication } from '@prisma/client';
import {
  MetricImportViewSchema,
  type MetricImportView,
  type MetricSnapshotView,
  type PublicationPollingView,
  type PublicationView,
} from '@studio/shared/api';
import {
  MetricImportOriginSchema,
  MetricSnapshotSchema,
  PublicationSchema,
  type MetricImportOrigin,
  type MetricSnapshot,
  type Publication,
} from '@studio/shared/metrics';
import { PublicationOriginSchema, PublishAttemptIdSchema } from '@studio/shared/platforms';
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

/**
 * A publication with its rev 7 fields (SPEC 0007 sections 4.1 and 5.4): `origin` (`manual`,
 * `studio` or `mock`, checked here because the added column has no table CHECK, K8) and the
 * `attemptId` of the studio attempt that created it. `polling` is set when the caller derived it
 * and left absent (unknown) otherwise.
 */
export function toPublicationView(row: RunPublication, polling?: PublicationPollingView | null): PublicationView {
  const publication = toPublication(row);
  const origin = PublicationOriginSchema.safeParse(row.origin);
  const attemptId = PublishAttemptIdSchema.nullable().safeParse(row.attemptId);
  if (!origin.success || !attemptId.success || (origin.data === 'manual') !== (attemptId.data === null)) {
    throw new MetricsRowCorruptError('run_publications', row.id);
  }
  const view: PublicationView = { ...publication, origin: origin.data, attemptId: attemptId.data };
  return polling === undefined ? view : { ...view, polling };
}

/** A stored import's origin; an unknown value breaks the contract (K8: zod, not a table CHECK). */
export function toMetricImportOrigin(row: Pick<MetricImport, 'id' | 'origin'>): MetricImportOrigin {
  const origin = MetricImportOriginSchema.safeParse(row.origin);
  if (!origin.success) throw new MetricsRowCorruptError('metric_imports', row.id);
  return origin.data;
}

/**
 * A snapshot with its rev 7 `origin` (SPEC 0007 section 5.6): `form` for source `form`, `api` when
 * the snapshot's import has `origin = 'api'`, `csv-upload` otherwise. `importOrigins` maps import
 * ids to their stored origin.
 */
export function toMetricSnapshotView(snapshot: MetricSnapshot, importOrigins: ReadonlyMap<string, MetricImportOrigin>): MetricSnapshotView {
  if (snapshot.source === 'form') return { ...snapshot, origin: 'form' };
  const importOrigin = snapshot.importId === null ? undefined : importOrigins.get(snapshot.importId);
  return { ...snapshot, origin: importOrigin === 'api' ? 'api' : 'csv-upload' };
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
