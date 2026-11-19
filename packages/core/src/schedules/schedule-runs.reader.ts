import { Injectable } from '@nestjs/common';
import { RunFileError, RunFileNotFoundError, newUlid, readRunFile, runDirectory } from '@studio/shared/run-files';
import { type RunFile, type RunId } from '@studio/shared/run-format';
import { scheduleBounds, type ScheduleId } from '@studio/shared/schedules';
import { DataHome } from '../paths/data-home';
import { listRunFolderIds } from '../runs/run-folders';
import { MAX_INDEXED_RUN_FOLDERS } from '../runs/run-index.service';
import { type LastFiredRun } from './slot-decision';

/** The schedule's runs the guards need: the last fired run and how many wait at `review`. */
export interface FiredRunsState {
  lastFiredRun: LastFiredRun;
  runsAtReview: number;
}

/** The run a slot already created before a crash, if any (SPEC 0006 section 5.6 "Crash safety"). */
export type SlotRunLookup = { state: 'found'; runId: RunId } | { state: 'none' } | { state: 'unknown' };

export interface SlotRef {
  scheduleId: ScheduleId;
  slotAt: Date;
}

type RunRead = { state: 'read'; run: RunFile } | { state: 'absent' } | { state: 'unreadable' };

/** ULIDs sort by time in their first 10 characters (Crockford base32 keeps the order). */
const ULID_TIME_CHARS = 10;

/**
 * Read-only run-folder lookups for the watcher's schedule step, through the C5 helpers. Nothing here
 * writes a run file: the watcher writes the one `run.json` at `pending` in its own scope.
 */
@Injectable()
export class ScheduleRunsReader {
  constructor(private readonly dataHome: DataHome) {}

  /**
   * Reads the newest `maxSlotsPerEvaluation` fired runs. Older fired runs have long settled, and the
   * bound keeps one idle evaluation cheap.
   */
  async firedRunsState(firedRunIds: readonly RunId[]): Promise<FiredRunsState> {
    const checked = firedRunIds.slice(-scheduleBounds.maxSlotsPerEvaluation);
    const lastRunId = checked[checked.length - 1];
    let lastFiredRun: LastFiredRun = { state: 'none' };
    let runsAtReview = 0;
    for (const runId of checked) {
      const read = await this.readRun(runId);
      if (read.state === 'read' && read.run.state.status === 'review') runsAtReview += 1;
      if (runId === lastRunId) lastFiredRun = read.state === 'read' ? { state: 'read', status: read.run.state.status } : { state: 'unreadable' };
    }
    return { lastFiredRun, runsAtReview };
  }

  /**
   * The run created for this slot before a crash, found by its `schedule` link. Only run folders
   * created at or after the slot instant can hold it, so older folders are not opened. An unreadable
   * candidate answers `unknown`: the slot must not fire twice.
   */
  async findRunForSlot(slot: SlotRef): Promise<SlotRunLookup> {
    const slotMs = slot.slotAt.getTime();
    const earliest = newUlid(slotMs).slice(0, ULID_TIME_CHARS);
    const candidates = (await listRunFolderIds(this.dataHome.runs, MAX_INDEXED_RUN_FOLDERS)).filter(
      (runId) => runId.slice(0, ULID_TIME_CHARS) >= earliest,
    );
    let unknown = false;
    for (const runId of candidates) {
      const read = await this.readRun(runId);
      // A folder without run.json cannot hold the crashed write: run.json is written atomically.
      if (read.state === 'absent') continue;
      if (read.state === 'unreadable') {
        unknown = true;
        continue;
      }
      const link = read.run.schedule;
      if (link !== undefined && link.scheduleId === slot.scheduleId && Date.parse(link.slotAt) === slotMs) return { state: 'found', runId };
    }
    return unknown ? { state: 'unknown' } : { state: 'none' };
  }

  private async readRun(runId: RunId): Promise<RunRead> {
    try {
      const run = await readRunFile(runDirectory(this.dataHome.runs, runId));
      return run.runId === runId ? { state: 'read', run } : { state: 'unreadable' };
    } catch (error) {
      if (error instanceof RunFileNotFoundError) return { state: 'absent' };
      if (error instanceof RunFileError) return { state: 'unreadable' };
      throw error;
    }
  }
}
