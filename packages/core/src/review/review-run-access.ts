import { Injectable } from '@nestjs/common';
import { RunFileNotFoundError, readRunFile, readWatcherState, runDirectory } from '@studio/shared/run-files';
import { type RunFile, type RunId } from '@studio/shared/run-format';
import { DataHome } from '../paths/data-home';
import { ReviewNotAllowedError, ReviewRunMismatchError, ReviewRunNotFoundError } from './review.errors';

export interface LoadedRun {
  runId: RunId;
  runDir: string;
  run: RunFile;
}

/** Reads a run folder for the review handlers through C5 and applies the ADR 0003 ownership rule. */
@Injectable()
export class ReviewRunAccess {
  constructor(private readonly dataHome: DataHome) {}

  async load(runId: RunId): Promise<LoadedRun> {
    const runDir = runDirectory(this.dataHome.runs, runId);
    let run: RunFile;
    try {
      run = await readRunFile(runDir);
    } catch (error) {
      if (error instanceof RunFileNotFoundError) throw new ReviewRunNotFoundError(runId);
      throw error;
    }
    if (run.runId !== runId) throw new ReviewRunMismatchError(runId, run.runId, 'run.json');
    return { runId, runDir, run };
  }

  /** The shared C5 pid helper; the same check the watcher engine applies before it claims a run. */
  async isWatcherAlive(runDir: string): Promise<boolean> {
    return (await readWatcherState(runDir)).status === 'alive';
  }

  /** While a watcher pid lives, the watcher is the sole writer of the run (ADR 0003). */
  async assertNoLiveWatcher(loaded: LoadedRun): Promise<void> {
    if (await this.isWatcherAlive(loaded.runDir)) {
      throw new ReviewNotAllowedError(loaded.runId, loaded.run.state.status, 'live-watcher');
    }
  }
}
