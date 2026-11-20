import { Injectable } from '@nestjs/common';
import { DataHome } from '@studio/core/paths';
import { type RunIndexEntryView } from '@studio/shared/api';
import { readRunFile, runDirectory } from '@studio/shared/run-files';
import { type RunId, type RunScheduleLink } from '@studio/shared/run-format';

/** `run.json` reads in flight at once; a page holds at most 100 rows (rules/backend.md). */
const READ_CONCURRENCY = 8;

/**
 * `RunIndexEntryView.schedule` (SPEC 0006 section 4.4, C10 rev 5): copied from each listed run's
 * `run.json.schedule` at read time, as the A22 cursor is copied from `now.json`. C3 puts the link
 * on a run exactly when `createdBy` is `watcher`, so only those rows are read: at most one read per
 * listed row, bounded by the page size; no index column and no core change.
 */
@Injectable()
export class RunScheduleLinkReader {
  constructor(private readonly dataHome: DataHome) {}

  async withScheduleLinks(views: readonly RunIndexEntryView[]): Promise<RunIndexEntryView[]> {
    const linked: RunIndexEntryView[] = [];
    for (let start = 0; start < views.length; start += READ_CONCURRENCY) {
      const batch = views.slice(start, start + READ_CONCURRENCY);
      const links = await Promise.all(batch.map((view) => (view.createdBy === 'watcher' ? this.scheduleOf(view.runId) : null)));
      batch.forEach((view, index) => {
        const schedule = links[index] ?? null;
        // The strict contract wants the key absent, not `undefined`, on a row without a link.
        linked.push(schedule === null ? view : { ...view, schedule });
      });
    }
    return linked;
  }

  /** `null` for an absent, unreadable or foreign `run.json`, or one without a link. */
  private async scheduleOf(runId: RunId): Promise<RunScheduleLink | null> {
    try {
      const run = await readRunFile(runDirectory(this.dataHome.runs, runId));
      if (run.runId !== runId) return null;
      return run.schedule ?? null;
    } catch {
      // As A22's cursor: a read error is display data missing, not a failed listing.
      return null;
    }
  }
}
