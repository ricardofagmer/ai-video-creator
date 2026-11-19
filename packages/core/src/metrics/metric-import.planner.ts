import { type MetricSnapshot, type PlatformMetrics, type Publication } from '@studio/shared/metrics';
import { sameMetrics } from './metric-columns.mapper';
import { type MetricRowIssueAt, type ParsedMetricRow } from './metric-rows.parser';

/** One snapshot an applied import writes, keyed `(publicationId, asOfDate, 'csv')`. */
export interface PlannedSnapshotWrite {
  kind: 'created' | 'updated';
  publicationId: string;
  metrics: PlatformMetrics;
}

export interface MetricImportPlan {
  writes: PlannedSnapshotWrite[];
  matched: number;
  created: number;
  updated: number;
  unchanged: number;
  /** Distinct platform video ids with no recorded publication, in file order. */
  unmatchedIds: string[];
  /** Repeated ids inside one file: the first row is kept, the rest are `duplicate-row`. */
  duplicateIssues: MetricRowIssueAt[];
}

/**
 * The plan stage (SPEC 0006 section 5.3, B7). Pure. Rows are matched only by platform video id,
 * never by title, date or view count, because a wrong match would move the score of the wrong
 * asset versions. `publications` are those of the import's platform; `existingSnapshots` are the
 * `csv` snapshots already stored for the import's `asOfDate`. A matched row is `created` when no
 * such snapshot exists, `unchanged` when its metrics are equal, and `updated` otherwise, so the
 * same file imported twice for the same day plans no write at all.
 */
export function planMetricImport(
  rows: readonly ParsedMetricRow[],
  publications: readonly Pick<Publication, 'publicationId' | 'platformVideoId'>[],
  existingSnapshots: readonly Pick<MetricSnapshot, 'publicationId' | 'metrics'>[],
): MetricImportPlan {
  const publicationIdByVideoId = new Map(publications.map((publication) => [publication.platformVideoId, publication.publicationId]));
  const existingByPublicationId = new Map(existingSnapshots.map((snapshot) => [snapshot.publicationId, snapshot.metrics]));
  const plan: MetricImportPlan = { writes: [], matched: 0, created: 0, updated: 0, unchanged: 0, unmatchedIds: [], duplicateIssues: [] };
  const seenVideoIds = new Set<string>();

  for (const row of rows) {
    if (seenVideoIds.has(row.platformVideoId)) {
      plan.duplicateIssues.push({ line: row.line, issue: 'duplicate-row' });
      continue;
    }
    seenVideoIds.add(row.platformVideoId);
    const publicationId = publicationIdByVideoId.get(row.platformVideoId);
    if (publicationId === undefined) {
      plan.unmatchedIds.push(row.platformVideoId);
      continue;
    }
    plan.matched += 1;
    const existing = existingByPublicationId.get(publicationId);
    if (existing === undefined) {
      plan.created += 1;
      plan.writes.push({ kind: 'created', publicationId, metrics: row.metrics });
    } else if (sameMetrics(existing, row.metrics)) {
      plan.unchanged += 1;
    } else {
      plan.updated += 1;
      plan.writes.push({ kind: 'updated', publicationId, metrics: row.metrics });
    }
  }
  return plan;
}
