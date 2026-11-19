import { rm } from 'node:fs/promises';
import { ApprovalFileSchema, type ApprovalFile } from '../run-format/approval';
import { ControlRequestSchema, WatcherPidTextSchema, formatWatcherPid, type ControlRequest } from '../run-format/control';
import { runFileNames } from '../run-format/layout';
import { NowFileSchema, type NowFile } from '../run-format/now';
import { RunFileSchema, type RunFile } from '../run-format/run-file';
import { writeFileAtomic, writeJsonAtomic } from './atomic-write';
import { RunFileNotFoundError, RunFileSchemaError, RunFileWriteError, hasErrorCode } from './errors';
import { readJsonFile, readOptionalJsonFile, readTextFile, type OptionalFile } from './read';
import { resolveInsideRun } from './run-paths';

/** run.json. Throws `UnsupportedRunFormatError` for `format > 1`. */
export async function readRunFile(runDir: string): Promise<RunFile> {
  return readJsonFile(resolveInsideRun(runDir, runFileNames.run), RunFileSchema);
}

export async function writeRunFile(runDir: string, run: RunFile): Promise<void> {
  await writeJsonAtomic(resolveInsideRun(runDir, runFileNames.run), RunFileSchema, run);
}

export async function readNowFile(runDir: string): Promise<OptionalFile<NowFile>> {
  return readOptionalJsonFile(resolveInsideRun(runDir, runFileNames.now), NowFileSchema);
}

export async function writeNowFile(runDir: string, now: NowFile): Promise<void> {
  await writeJsonAtomic(resolveInsideRun(runDir, runFileNames.now), NowFileSchema, now);
}

export async function readControlRequest(runDir: string): Promise<OptionalFile<ControlRequest>> {
  return readOptionalJsonFile(resolveInsideRun(runDir, runFileNames.control), ControlRequestSchema);
}

export async function writeControlRequest(runDir: string, request: ControlRequest): Promise<void> {
  await writeJsonAtomic(resolveInsideRun(runDir, runFileNames.control), ControlRequestSchema, request);
}

async function removeRunFile(runDir: string, relativePath: string): Promise<void> {
  const filePath = resolveInsideRun(runDir, relativePath);
  try {
    await rm(filePath, { force: true });
  } catch (error) {
    throw new RunFileWriteError(filePath, { cause: error });
  }
}

/** The watcher deletes control.json when an execution starts (ADR 0003 "Who writes what"). */
export async function removeControlRequest(runDir: string): Promise<void> {
  await removeRunFile(runDir, runFileNames.control);
}

export async function readApprovalFile(runDir: string): Promise<OptionalFile<ApprovalFile>> {
  return readOptionalJsonFile(resolveInsideRun(runDir, runFileNames.approval), ApprovalFileSchema);
}

export async function writeApprovalFile(runDir: string, approval: ApprovalFile): Promise<void> {
  await writeJsonAtomic(resolveInsideRun(runDir, runFileNames.approval), ApprovalFileSchema, approval);
}

export async function writeWatcherPid(runDir: string, pid: number): Promise<void> {
  await writeFileAtomic(resolveInsideRun(runDir, runFileNames.watcherPid), formatWatcherPid(pid));
}

export async function removeWatcherPid(runDir: string): Promise<void> {
  await removeRunFile(runDir, runFileNames.watcherPid);
}

export async function readWatcherPid(runDir: string): Promise<OptionalFile<number>> {
  const filePath = resolveInsideRun(runDir, runFileNames.watcherPid);
  let text: string;
  try {
    text = await readTextFile(filePath);
  } catch (error) {
    if (error instanceof RunFileNotFoundError) return { status: 'absent' };
    throw error;
  }
  const checked = WatcherPidTextSchema.safeParse(text);
  if (!checked.success) throw new RunFileSchemaError(filePath, ['watcher.pid must hold one decimal pid']);
  return { status: 'present', value: checked.data };
}

/** Signal 0 checks existence only; EPERM means the process exists under another user. */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (hasErrorCode(error, 'ESRCH')) return false;
    if (hasErrorCode(error, 'EPERM')) return true;
    throw error;
  }
}

export type WatcherState = { status: 'absent' } | { status: 'alive'; pid: number } | { status: 'dead'; pid: number };

/** Whether a live watcher owns the run; `running` is shown only when it is `alive` (PRD 7.2). */
export async function readWatcherState(runDir: string): Promise<WatcherState> {
  const pidFile = await readWatcherPid(runDir);
  if (pidFile.status === 'absent') return { status: 'absent' };
  const pid = pidFile.value;
  return isProcessAlive(pid) ? { status: 'alive', pid } : { status: 'dead', pid };
}
