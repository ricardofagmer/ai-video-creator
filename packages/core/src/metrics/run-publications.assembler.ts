import { type RunPublicationEntryView } from '@studio/shared/api';
import {
  METRIC_HISTORY_SHOWN,
  selectSnapshotInForce,
  type MetricSnapshot,
  type Platform,
  type PlatformBaseline,
  type Publication,
} from '@studio/shared/metrics';

/** Newest day first; on the same day `form` before `csv`, the order the in-force rule uses. */
function newestFirst(left: MetricSnapshot, right: MetricSnapshot): number {
  if (left.asOfDate !== right.asOfDate) return left.asOfDate < right.asOfDate ? 1 : -1;
  if (left.source === right.source) return 0;
  return left.source === 'form' ? -1 : 1;
}

/**
 * One run-page entry (SPEC 0006 sections 4.4, 5.2): the snapshot in force (latest `asOfDate`, `form`
 * over `csv` on a tie), the other snapshots as history, newest first, cut at 20, and whether the
 * platform has a baseline. Pure.
 */
export function toRunPublicationEntry(
  publication: Publication,
  snapshots: readonly MetricSnapshot[],
  baselines: Readonly<Record<Platform, PlatformBaseline | null>>,
): RunPublicationEntryView {
  const own = snapshots.filter((snapshot) => snapshot.publicationId === publication.publicationId);
  const inForce = selectSnapshotInForce(own);
  const history = own
    .filter((snapshot) => snapshot !== inForce)
    .sort(newestFirst)
    .slice(0, METRIC_HISTORY_SHOWN);
  return { publication, inForce, history, baselineReady: baselines[publication.platform] !== null };
}
