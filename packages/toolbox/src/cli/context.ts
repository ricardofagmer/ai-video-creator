import type { PipelineStage, RunFile, VideoState } from '@studio/shared/ace';
import type { ToolboxEnv } from '../config/env';
import { resolveRunDir } from '../run/run-paths';
import { readRun, writeRun } from '../run/run-store';

export interface ActiveRun {
  runDir: string;
  run: RunFile;
}

/** What every command returns; printed as the final stdout JSON line. */
export interface CommandOutcome {
  runId: string | null;
  state: VideoState | null;
  next: string;
}

/**
 * Per-invocation state shared between a command and the CLI error handler: which run
 * is open and whether a stage has started (so a failure can be recorded once).
 */
export class CommandContext {
  active: ActiveRun | null = null;
  stage: PipelineStage | null = null;

  constructor(readonly env: ToolboxEnv) {}

  async openRun(argument: string): Promise<ActiveRun> {
    const runDir = resolveRunDir(this.env, argument);
    const run = await readRun(runDir);
    this.active = { runDir, run };
    return this.active;
  }

  /** Marks the point after which an unexpected error moves the run to FAILED. */
  beginStage(stage: PipelineStage): void {
    this.stage = stage;
  }

  /** Persists run.json atomically and keeps the in-memory copy current. */
  async commit(runDir: string, run: RunFile): Promise<RunFile> {
    const stamped = { ...run, updatedAt: new Date().toISOString() };
    await writeRun(runDir, stamped);
    this.active = { runDir, run: stamped };
    return stamped;
  }

  /** Human-readable progress goes to stderr; stdout ends with the JSON line. */
  log(message: string): void {
    process.stderr.write(`${message}\n`);
  }
}
