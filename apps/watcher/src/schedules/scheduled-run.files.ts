import { lstat } from 'node:fs/promises';
import { Inject, Injectable } from '@nestjs/common';
import { DataHome } from '@studio/core/paths';
import { readRunFile, runDirectory, writeRunFile } from '@studio/shared/run-files';
import { type RunFile, type RunId, type RunScheduleLink } from '@studio/shared/run-format';
import { ScheduledRunExistsError, ScheduledRunLinkMismatchError, ScheduledRunShapeRefusedError } from './schedule-step.errors';

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

/** The slot a run was found for after a crash: its id and the instant, to re-check the link. */
export interface FoundSlotRun {
  runId: RunId;
  scheduleId: string;
  slotAt: Date;
}

/**
 * The schedule step's only run-folder access (SPEC 0006 section 4.6, ADR 0003 as amended). `create`
 * is the one write: a new `runs/<runId>/run.json` at `pending`, with `createdBy: 'watcher'` and its
 * `schedule` link, through the C5 helper. It refuses any other shape and an existing folder, so it
 * can never write another status, overwrite a run, or touch `approval.json` or `control.json`.
 * `linkOf` only reads.
 */
@Injectable()
export class ScheduledRunFiles {
  constructor(@Inject(DataHome) private readonly dataHome: DataHome) {}

  async create(run: RunFile): Promise<void> {
    if (run.state.status !== 'pending') throw new ScheduledRunShapeRefusedError(run.runId, 'status-not-pending');
    if (run.createdBy !== 'watcher') throw new ScheduledRunShapeRefusedError(run.runId, 'not-created-by-watcher');
    if (run.schedule === undefined) throw new ScheduledRunShapeRefusedError(run.runId, 'schedule-link-missing');
    const runDir = runDirectory(this.dataHome.runs, run.runId);
    if (await this.exists(runDir)) throw new ScheduledRunExistsError(run.runId);
    await writeRunFile(runDir, run);
  }

  /** The `schedule` link of a run found for a slot; it must still name that slot. */
  async linkOf(found: FoundSlotRun): Promise<RunScheduleLink> {
    const run = await readRunFile(runDirectory(this.dataHome.runs, found.runId));
    const link = run.schedule;
    if (link === undefined || link.scheduleId !== found.scheduleId || Date.parse(link.slotAt) !== found.slotAt.getTime()) {
      throw new ScheduledRunLinkMismatchError(found.runId);
    }
    return link;
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await lstat(path);
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }
}
