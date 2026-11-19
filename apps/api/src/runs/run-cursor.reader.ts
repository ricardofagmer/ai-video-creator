import { Injectable } from '@nestjs/common';
import { DataHome } from '@studio/core/paths';
import { type RunIndexEntry } from '@studio/core/runs';
import { type RunCursorView, type RunIndexEntryView } from '@studio/shared/api';
import { readNowFile, runDirectory } from '@studio/shared/run-files';
import { type RunId, type RunStatus } from '@studio/shared/run-format';

/** A22: only these recorded statuses have a current `now.json`; a finished run's is stale. */
const cursorStatuses: ReadonlySet<RunStatus> = new Set<RunStatus>(['running', 'waiting', 'paused', 'interrupted']);

/** `now.json` reads in flight at once; a page holds at most 100 rows (rules/backend.md). */
const READ_CONCURRENCY = 8;

/**
 * `RunIndexEntryView.cursor` (SPEC 0002 rev 4, section 13.2, A22): the stage and step copied from
 * each listed run's `now.json` at read time. At most one read per listed row, so bounded by the
 * page size; no index column, no Prisma migration and no C8 change.
 */
@Injectable()
export class RunCursorReader {
  constructor(private readonly dataHome: DataHome) {}

  async withCursors(entries: readonly RunIndexEntry[]): Promise<RunIndexEntryView[]> {
    const views: RunIndexEntryView[] = [];
    for (let start = 0; start < entries.length; start += READ_CONCURRENCY) {
      const batch = entries.slice(start, start + READ_CONCURRENCY);
      const cursors = await Promise.all(batch.map((entry) => this.cursorOf(entry.runId, entry.status)));
      batch.forEach((entry, index) => views.push({ ...entry, cursor: cursors[index] ?? null }));
    }
    return views;
  }

  /** `null` for other statuses, an absent or unreadable `now.json`, or one naming another run. */
  private async cursorOf(runId: RunId, status: RunStatus): Promise<RunCursorView | null> {
    if (!cursorStatuses.has(status)) return null;
    try {
      const now = await readNowFile(runDirectory(this.dataHome.runs, runId));
      if (now.status === 'absent' || now.value.runId !== runId) return null;
      return { stageId: now.value.stageId, step: now.value.step };
    } catch {
      // A22: a read error is display data missing, not a failed listing.
      return null;
    }
  }
}
