import { stat } from 'node:fs/promises';
import { Injectable } from '@nestjs/common';
import { DataHome } from '@studio/core/paths';
import { RunFolderMismatchError, RunNotFoundError } from '@studio/core/runs';
import { type RunEventsResponse, type RunStateResponse } from '@studio/shared/api';
import {
  RunFileNotFoundError,
  readApprovalFile,
  readNowFile,
  readRunEvents,
  readRunFile,
  readWatcherState,
  runDirectory,
} from '@studio/shared/run-files';
import { displayedRunStatus, type RunFile, type RunId } from '@studio/shared/run-format';
import { MonthSpendReader } from './month-spend.reader';
import { RunArtifactAccessService } from './run-artifact-access.service';

/** One events poll answers at most 1 MiB; the client continues from `nextByte` (bounded memory per request). */
const EVENTS_PAGE_BYTES = 1024 * 1024;

/**
 * Live run state from the run files (ADR 0003 decision 3: files win over the index). Read-only:
 * the api never writes run.json while a watcher may own it.
 */
@Injectable()
export class RunStateReader {
  constructor(
    private readonly dataHome: DataHome,
    private readonly monthSpend: MonthSpendReader,
    private readonly artifactAccess: RunArtifactAccessService,
  ) {}

  async readState(runId: RunId): Promise<RunStateResponse> {
    const runDir = runDirectory(this.dataHome.runs, runId);
    const run = await this.readRun(runId, runDir);
    const [watcher, now, approval, monthSpendUsd, artifactAccess] = await Promise.all([
      readWatcherState(runDir),
      readNowFile(runDir),
      readApprovalFile(runDir),
      this.monthSpend.read(),
      this.artifactAccess.forRun(runId, runDir, run),
    ]);
    return {
      run,
      displayedStatus: displayedRunStatus(run.state, watcher.status === 'alive'),
      watcher: watcher.status,
      // A now.json or approval.json naming another run is not this run's state; it is left out.
      now: now.status === 'present' && now.value.runId === runId ? now.value : null,
      approval: approval.status === 'present' && approval.value.runId === runId ? approval.value : null,
      monthSpendUsd,
      artifactAccess,
    };
  }

  async readEvents(runId: RunId, fromByte: number): Promise<RunEventsResponse> {
    const runDir = runDirectory(this.dataHome.runs, runId);
    await this.assertRunFolder(runId, runDir);
    const page = await readRunEvents(runDir, fromByte, EVENTS_PAGE_BYTES);
    return { entries: page.entries, nextByte: page.nextByte, pendingTailBytes: page.pendingTailBytes };
  }

  private async readRun(runId: RunId, runDir: string): Promise<RunFile> {
    let run: RunFile;
    try {
      run = await readRunFile(runDir);
    } catch (error) {
      if (error instanceof RunFileNotFoundError) throw new RunNotFoundError(runId);
      throw error;
    }
    if (run.runId !== runId) throw new RunFolderMismatchError(runId, run.runId);
    return run;
  }

  /** Events of an unknown run are a 404, not an empty page the web would poll forever. */
  private async assertRunFolder(runId: RunId, runDir: string): Promise<void> {
    const folder = await stat(runDir).catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
      throw error;
    });
    if (folder === null || !folder.isDirectory()) throw new RunNotFoundError(runId);
  }
}
