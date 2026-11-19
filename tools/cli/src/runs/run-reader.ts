import { readdir } from 'node:fs/promises';
import { RunNotFoundError } from '@studio/core/runs';
import {
  RunFileError,
  readNowFile,
  readRunFile,
  readWatcherState,
  runDirectory,
  type RunFileErrorCode,
  type WatcherState,
} from '@studio/shared/run-files';
import { RunIdSchema, displayedRunStatus, type NowFile, type RunFile, type RunId, type RunStatus } from '@studio/shared/run-format';
import { CliError } from '../errors/cli.errors.js';

/** One run as the CLI shows it, read straight from its folder through C5 (no api, no index). */
export interface RunSnapshot {
  runId: RunId;
  runDir: string;
  run: RunFile;
  /** C3 `displayedRunStatus`: a recorded `running` with a dead watcher reads as `interrupted`. */
  displayedStatus: RunStatus;
  watcher: WatcherState;
  /** Live step detail; only while a watcher lives, since a dead watcher's now.json is stale. */
  now: NowFile | null;
}

export type RunReadResult =
  | { status: 'read'; snapshot: RunSnapshot }
  | { status: 'unreadable'; runId: RunId; problem: RunFileErrorCode | 'run-id-mismatch' };

export type UnreadableRunProblem = Extract<RunReadResult, { status: 'unreadable' }>['problem'];

/** run.json exists but cannot be used (invalid JSON, schema, newer format); nothing is written. */
export class RunUnreadableError extends CliError {
  override readonly category = 'internal';

  constructor(
    readonly runId: RunId,
    readonly problem: UnreadableRunProblem,
  ) {
    super(`O run.json da execução ${runId} não pôde ser lido (${problem}).`);
    this.name = 'RunUnreadableError';
  }
}

export interface RecentRuns {
  results: RunReadResult[];
  /** Run folders found, independent of the limit. */
  total: number;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

async function readLiveNow(runDir: string, runId: RunId, watcher: WatcherState): Promise<NowFile | null> {
  if (watcher.status !== 'alive') return null;
  try {
    const now = await readNowFile(runDir);
    return now.status === 'present' && now.value.runId === runId ? now.value : null;
  } catch (error) {
    // now.json is rewritten several times a second; a torn or invalid read just shows no detail.
    if (error instanceof RunFileError) return null;
    throw error;
  }
}

async function loadSnapshot(runsRoot: string, runId: RunId): Promise<RunReadResult> {
  const runDir = runDirectory(runsRoot, runId);
  let run: RunFile;
  try {
    run = await readRunFile(runDir);
  } catch (error) {
    if (error instanceof RunFileError) return { status: 'unreadable', runId, problem: error.code };
    throw error;
  }
  if (run.runId !== runId) return { status: 'unreadable', runId, problem: 'run-id-mismatch' };
  const watcher = await readWatcherState(runDir);
  const snapshot: RunSnapshot = {
    runId,
    runDir,
    run,
    displayedStatus: displayedRunStatus(run.state, watcher.status === 'alive'),
    watcher,
    now: await readLiveNow(runDir, runId, watcher),
  };
  return { status: 'read', snapshot };
}

/** Throws `RunNotFoundError` for a missing or foreign run.json, `RunUnreadableError` otherwise. */
export async function readRunSnapshot(runsRoot: string, runId: RunId): Promise<RunSnapshot> {
  const result = await loadSnapshot(runsRoot, runId);
  if (result.status === 'read') return result.snapshot;
  if (result.problem === 'not-found' || result.problem === 'run-id-mismatch') throw new RunNotFoundError(runId);
  throw new RunUnreadableError(runId, result.problem);
}

async function listRunFolderIds(runsRoot: string): Promise<RunId[]> {
  let names: string[];
  try {
    const entries = await readdir(runsRoot, { withFileTypes: true });
    names = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return [];
    throw error;
  }
  return names.filter((name) => RunIdSchema.safeParse(name).success);
}

/**
 * The newest `limit` runs, newest first. Run ids are ULIDs, so the name order is creation order
 * and only the runs shown are read.
 */
export async function listRecentRuns(runsRoot: string, limit: number): Promise<RecentRuns> {
  const runIds = (await listRunFolderIds(runsRoot)).sort().reverse();
  const results: RunReadResult[] = [];
  for (const runId of runIds.slice(0, limit)) results.push(await loadSnapshot(runsRoot, runId));
  return { results, total: runIds.length };
}

/** Every run id with a folder, oldest first; for cost indexing in `doctor`. */
export async function listAllRunIds(runsRoot: string): Promise<RunId[]> {
  return (await listRunFolderIds(runsRoot)).sort();
}
