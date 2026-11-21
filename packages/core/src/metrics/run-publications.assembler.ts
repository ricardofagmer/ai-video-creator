import { type PublicationView, type RunPublicationEntryView } from '@studio/shared/api';
import {
  METRIC_HISTORY_SHOWN,
  selectSnapshotInForce,
  type MetricImportOrigin,
  type MetricSnapshot,
  type Platform,
  type PlatformBaseline,
} from '@studio/shared/metrics';
import { toMetricSnapshotView } from './metrics.mapper';

/** Newest day first; on the same day `form` before `csv`, the order the in-force rule uses. */
function newestFirst(left: MetricSnapshot, right: MetricSnapshot): number {
  if (left.asOfDate !== right.asOfDate) return left.asOfDate < right.asOfDate ? 1 : -1;
  if (left.source === right.source) return 0;
  return left.source === 'form' ? -1 : 1;
}

/**
 * One run-page entry (SPEC 0006 sections 4.4, 5.2): the snapshot in force (latest `asOfDate`, `form`
 * over `csv` on a tie), the other snapshots as history, newest first, cut at 20, and whether the
 * platform has a baseline. Rev 7 (SPEC 0007 sections 5.6, B6): each snapshot carries its `origin`
 * from `importOrigins`, and a simulated publication never reports a baseline, because its numbers
 * are excluded from every baseline and score. Pure.
 */
export function toRunPublicationEntry(
  publication: PublicationView,
  facts: {
    snapshots: readonly MetricSnapshot[];
    baselines: Readonly<Record<Platform, PlatformBaseline | null>>;
    importOrigins: ReadonlyMap<string, MetricImportOrigin>;
  },
): RunPublicationEntryView {
  const own = facts.snapshots.filter((snapshot) => snapshot.publicationId === publication.publicationId);
  const inForce = selectSnapshotInForce(own);
  const history = own
    .filter((snapshot) => snapshot !== inForce)
    .sort(newestFirst)
    .slice(0, METRIC_HISTORY_SHOWN)
    .map((snapshot) => toMetricSnapshotView(snapshot, facts.importOrigins));
  return {
    publication,
    inForce: inForce === null ? null : toMetricSnapshotView(inForce, facts.importOrigins),
    history,
    baselineReady: publication.origin !== 'mock' && facts.baselines[publication.platform] !== null,
  };
}
