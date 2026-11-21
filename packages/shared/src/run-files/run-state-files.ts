import { constants } from 'node:fs';
import { link, open, rename, rm } from 'node:fs/promises';
import { ApprovalFileSchema, type ApprovalFile } from '../run-format/approval';
import { ControlRequestSchema, type ControlRequest } from '../run-format/control';
import { runFileNames } from '../run-format/layout';
import { NowFileSchema, type NowFile } from '../run-format/now';
import { RunFileSchema, type RunFile } from '../run-format/run-file';
import { writeFileAtomic, writeJsonAtomic } from './atomic-write';
import { RunFileError, RunFileSchemaError, RunFileWriteError, hasErrorCode } from './errors';
import { currentBootTimeMs, formatProcessStamp, isPidAliveSince, isStampAlive, parseProcessStamp, type ProcessStamp } from './process-identity';
import { readJsonFile, readOptionalJsonFile, type OptionalFile } from './read';
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

function sameControlRequest(left: ControlRequest, right: ControlRequest): boolean {
  return (
    left.pause === right.pause &&
    left.stop === right.stop &&
    left.at === right.at &&
    (left.resume ?? false) === (right.resume ?? false) &&
    (left.correlationId ?? null) === (right.correlationId ?? null)
  );
}

async function readParkedRequest(filePath: string): Promise<ControlRequest | null> {
  try {
    return await readJsonFile(filePath, ControlRequestSchema);
  } catch (error) {
    if (error instanceof RunFileError) return null;
    throw error;
  }
}

/** `removed`: the request that was read is gone. `kept-newer`: a later request was left in place. */
export type ControlClearResult = 'absent' | 'removed' | 'kept-newer';

/**
 * Deletes control.json only while it still holds `expected`, the request the watcher read and acted
 * on (baseline review "lost pause"). A request the api or CLI wrote after that read survives: the
 * file is first renamed aside (atomic, so no write lands in between unseen), compared, and put back
 * with `link`, which never replaces a request written later still.
 */
export async function removeControlRequestIfUnchanged(runDir: string, expected: ControlRequest): Promise<ControlClearResult> {
  const filePath = resolveInsideRun(runDir, runFileNames.control);
  const parkedPath = resolveInsideRun(runDir, `${runFileNames.control}.clearing-${process.pid}`);
  try {
    await rename(filePath, parkedPath);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return 'absent';
    throw new RunFileWriteError(filePath, { cause: error });
  }
  try {
    const parked = await readParkedRequest(parkedPath);
    if (parked !== null && sameControlRequest(parked, expected)) return 'removed';
    try {
      await link(parkedPath, filePath);
    } catch (error) {
      // EEXIST: an even newer request arrived meanwhile, and it wins.
      if (!hasErrorCode(error, 'EEXIST')) throw new RunFileWriteError(filePath, { cause: error });
    }
    return 'kept-newer';
  } finally {
    await rm(parkedPath, { force: true });
  }
}

export async function readApprovalFile(runDir: string): Promise<OptionalFile<ApprovalFile>> {
  return readOptionalJsonFile(resolveInsideRun(runDir, runFileNames.approval), ApprovalFileSchema);
}

export async function writeApprovalFile(runDir: string, approval: ApprovalFile): Promise<void> {
  await writeJsonAtomic(resolveInsideRun(runDir, runFileNames.approval), ApprovalFileSchema, approval);
}


/*
 * `watcher.pid` (RUN-FORMAT section 14, baseline review critic major 1): `<pid> <bootTimeMs>\n`, the
 * process stamp of `process-identity.ts`. A bare pid is not an identity: after a reboot or a forced
 * exit the pid of a dead watcher can belong to any process, and a watcher restarted by launchd can
 * even get its old pid back. An older file holding only `<pid>\n` is still read: its mtime stands in
 * for the boot it was written under, so it is stale when it predates this boot or when signal 0
 * proves the pid gone; otherwise its pid decides, as before.
 */

/** A stamp line is at most 23 bytes; anything larger was not written by this helper. */
const MAX_WATCHER_PID_BYTES = 64;
/** Run files are owner-only (atomic-write.ts). */
const WATCHER_PID_FILE_MODE = 0o600;

/** `watcher.pid` as read: the owner stamp and when the file was written. */
export interface WatcherPidRecord {
  stamp: ProcessStamp;
  /** The file's mtime; it dates an older bare-pid file, which records no boot time. */
  writtenAtMs: number;
}

export interface WatcherLivenessOptions {
  /** The reading watcher's own pid: a file naming it was left by an earlier life of that pid. */
  selfPid?: number;
  /** Fixed boot time (tests); defaults to the machine's. */
  bootTimeMs?: number;
}

/** Atomic rewrite with this process's stamp. The engine claims with `claimWatcherPid` instead. */
export async function writeWatcherPid(runDir: string, pid: number, bootTimeMs: number = currentBootTimeMs()): Promise<void> {
  await writeFileAtomic(resolveInsideRun(runDir, runFileNames.watcherPid), formatProcessStamp(pid, bootTimeMs));
}

/** `claimed`: this process created the file. `taken`: a file already exists, live or stale. */
export type WatcherPidClaim = 'claimed' | 'taken';

/**
 * Creates `watcher.pid` with O_EXCL and this process's stamp, flushed before it counts, so two
 * processes can never both believe they created it. A stale file is not replaced here: the caller
 * judges it with `readWatcherState` and removes it with `removeStaleWatcherPid` first.
 */
export async function claimWatcherPid(runDir: string, pid: number, bootTimeMs: number = currentBootTimeMs()): Promise<WatcherPidClaim> {
  const filePath = resolveInsideRun(runDir, runFileNames.watcherPid);
  let handle;
  try {
    handle = await open(filePath, 'wx', WATCHER_PID_FILE_MODE);
  } catch (error) {
    if (hasErrorCode(error, 'EEXIST')) return 'taken';
    throw new RunFileWriteError(filePath, { cause: error });
  }
  try {
    await handle.writeFile(formatProcessStamp(pid, bootTimeMs), { encoding: 'utf8' });
    await handle.sync();
  } catch (error) {
    await handle.close();
    // This process created the file and it holds no valid stamp, so it is removed again.
    await rm(filePath, { force: true });
    throw new RunFileWriteError(filePath, { cause: error });
  }
  await handle.close();
  return 'claimed';
}

/** Never follows a link and never blocks on a FIFO; anything but a small regular file is refused. */
export async function readWatcherStamp(runDir: string): Promise<OptionalFile<WatcherPidRecord>> {
  const filePath = resolveInsideRun(runDir, runFileNames.watcherPid);
  let handle;
  try {
    handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return { status: 'absent' };
    if (hasErrorCode(error, 'ELOOP')) throw new RunFileSchemaError(filePath, ['watcher.pid must not be a link']);
    throw error;
  }
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size > MAX_WATCHER_PID_BYTES) throw new RunFileSchemaError(filePath, ['watcher.pid must be a small regular file']);
    const stamp = parseProcessStamp(await handle.readFile({ encoding: 'utf8' }));
    if (stamp === null) throw new RunFileSchemaError(filePath, ['watcher.pid must hold a pid, optionally followed by a boot time']);
    return { status: 'present', value: { stamp, writtenAtMs: stats.mtimeMs } };
  } finally {
    await handle.close();
  }
}

/** The pid alone, from either form of the file. */
export async function readWatcherPid(runDir: string): Promise<OptionalFile<number>> {
  const record = await readWatcherStamp(runDir);
  return record.status === 'absent' ? record : { status: 'present', value: record.value.stamp.pid };
}

/**
 * Whether the watcher a `watcher.pid` names still runs (RUN-FORMAT section 14). A stamp is alive
 * only under this boot, as a live process of this user, and never as `selfPid`. An older bare pid
 * is alive only when written during this boot and signal 0 still finds a process of this user.
 */
export function isWatcherPidAlive(record: WatcherPidRecord, options: WatcherLivenessOptions = {}): boolean {
  if (record.stamp.bootTimeMs !== null) return isStampAlive(record.stamp, options);
  return isPidAliveSince(record.stamp.pid, record.writtenAtMs, options);
}

/**
 * Signal 0 checks existence only; EPERM means the process exists under another user. Kept for the
 * service pid files of the CLI and shell; `watcher.pid` is judged by `isWatcherPidAlive`.
 */
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

/**
 * Whether a live watcher owns the run; `running` is shown only when it is `alive` (PRD 7.2). The
 * watcher passes its own pid as `selfPid`; the api and CLI pass nothing.
 */
export async function readWatcherState(runDir: string, options: WatcherLivenessOptions = {}): Promise<WatcherState> {
  const record = await readWatcherStamp(runDir);
  if (record.status === 'absent') return { status: 'absent' };
  const { pid } = record.value.stamp;
  return isWatcherPidAlive(record.value, options) ? { status: 'alive', pid } : { status: 'dead', pid };
}

/**
 * Removes a `watcher.pid` that is judged stale again right before the removal. True when the path
 * is free afterwards (it was absent or stale), false when a live watcher holds it.
 */
export async function removeStaleWatcherPid(runDir: string, options: WatcherLivenessOptions = {}): Promise<boolean> {
  const state = await readWatcherState(runDir, options);
  if (state.status === 'alive') return false;
  if (state.status === 'dead') await removeRunFile(runDir, runFileNames.watcherPid);
  return true;
}

/** Unconditional removal; the engine releases its own file with `releaseWatcherPid`. */
export async function removeWatcherPid(runDir: string): Promise<void> {
  await removeRunFile(runDir, runFileNames.watcherPid);
}

/** `removed`: the file named `pid` and is gone. `not-owner`: another process's file was left alone. */
export type WatcherPidRelease = 'absent' | 'removed' | 'not-owner';

/** Removes `watcher.pid` only while it names `pid`; another watcher's file is never touched. */
export async function releaseWatcherPid(runDir: string, pid: number): Promise<WatcherPidRelease> {
  let record: OptionalFile<WatcherPidRecord>;
  try {
    record = await readWatcherStamp(runDir);
  } catch (error) {
    // An unreadable file was not written by this process's claim.
    if (error instanceof RunFileSchemaError) return 'not-owner';
    throw error;
  }
  if (record.status === 'absent') return 'absent';
  if (record.value.stamp.pid !== pid) return 'not-owner';
  await removeRunFile(runDir, runFileNames.watcherPid);
  return 'removed';
}
