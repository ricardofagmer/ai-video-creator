import { constants } from 'node:fs';
import { lstat, open, unlink } from 'node:fs/promises';
import { RunFileWriteError, hasErrorCode } from '../../run-files/errors';
import { isProcessAlive } from '../../run-files/run-state-files';
import { fireLockBounds } from '../constants';
import { scheduleFilePath, type ScheduleLocation } from './paths';

/*
 * `schedules/<scheduleId>/fire.lock` (SPEC 0006 section 4.6, OD4 single run writer): the watcher
 * holds it for one evaluation of one schedule, so two daemons on one data home cannot both find
 * no run for a slot and both fire it. Created with O_EXCL; it holds the owner's decimal pid.
 *
 * Taking over a stale lock is itself serialized by `fire.lock.takeover` (O_EXCL, held for a few
 * file operations), and the stale lock is removed only when it is still the same inode that was
 * judged stale. Two processes that both judge one lock stale therefore cannot both remove it: the
 * second finds a different inode (the first one's new lock) and reports `held`.
 */

const LOCK_FILE_MODE = 0o600;
/** A pid line is at most 11 bytes; anything larger was not written by this helper. */
const MAX_LOCK_BYTES = 64;
/** Above every pid macOS and Linux hand out; a larger number was not written by this helper. */
const MAX_PID = 4_194_304;

/** `acquired`: this process holds the lock. `held`: another live process does; try again later. */
export type FireLockResult = { state: 'acquired' } | { state: 'held'; pid: number | null };

interface LockIdentity {
  dev: number;
  ino: number;
}

type LockOwner =
  | { state: 'absent' }
  | { state: 'live'; pid: number | null }
  | { state: 'stale'; identity: LockIdentity }
  | { state: 'own' };

async function createExclusive(filePath: string, content: string): Promise<boolean> {
  let handle;
  try {
    handle = await open(filePath, 'wx', LOCK_FILE_MODE);
  } catch (error) {
    if (hasErrorCode(error, 'EEXIST')) return false;
    throw new RunFileWriteError(filePath, { cause: error });
  }
  try {
    await handle.writeFile(content, { encoding: 'utf8' });
  } finally {
    await handle.close();
  }
  return true;
}

function parsePid(text: string): number | null {
  const trimmed = text.trim();
  if (!/^[1-9][0-9]{0,6}$/.test(trimmed)) return null;
  const pid = Number.parseInt(trimmed, 10);
  return pid <= MAX_PID ? pid : null;
}

/**
 * Who holds the lock now. Never follows a link and never blocks on a FIFO; a lock that is not a
 * small regular file is stale.
 */
async function lockOwner(lockPath: string, pid: number, nowMs: number): Promise<LockOwner> {
  let handle;
  try {
    handle = await open(lockPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return { state: 'absent' };
    if (hasErrorCode(error, 'ELOOP')) return staleByPath(lockPath);
    throw error;
  }
  let ageMs: number;
  let text: string;
  let identity: LockIdentity;
  try {
    const stats = await handle.stat();
    identity = { dev: stats.dev, ino: stats.ino };
    if (!stats.isFile() || stats.size > MAX_LOCK_BYTES) return { state: 'stale', identity };
    ageMs = nowMs - stats.mtimeMs;
    text = await handle.readFile({ encoding: 'utf8' });
  } finally {
    await handle.close();
  }
  const ownerPid = parsePid(text);
  if (ownerPid === null) return ageMs > fireLockBounds.unreadableStaleMs ? { state: 'stale', identity } : { state: 'live', pid: null };
  if (ownerPid === pid) return { state: 'own' };
  if (ageMs > fireLockBounds.staleMs || !isProcessAlive(ownerPid)) return { state: 'stale', identity };
  return { state: 'live', pid: ownerPid };
}

/** A symlink at the lock path: stale, identified by the link itself. */
async function staleByPath(lockPath: string): Promise<LockOwner> {
  try {
    const stats = await lstat(lockPath);
    return { state: 'stale', identity: { dev: stats.dev, ino: stats.ino } };
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return { state: 'absent' };
    throw error;
  }
}

async function removeIfPresent(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    if (!hasErrorCode(error, 'ENOENT')) throw new RunFileWriteError(filePath, { cause: error });
  }
}

function sameIdentity(left: LockIdentity, right: LockIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

/**
 * Takes `fire.lock.takeover`. One left by a process that died inside its few file operations is
 * removed once it is older than `unreadableStaleMs`; until then the takeover waits a tick.
 */
async function acquireTakeover(takeoverPath: string, pid: number, nowMs: number): Promise<boolean> {
  if (await createExclusive(takeoverPath, `${pid}\n`)) return true;
  try {
    const stats = await lstat(takeoverPath);
    if (nowMs - stats.mtimeMs <= fireLockBounds.unreadableStaleMs) return false;
  } catch (error) {
    if (!hasErrorCode(error, 'ENOENT')) throw error;
  }
  await removeIfPresent(takeoverPath);
  return createExclusive(takeoverPath, `${pid}\n`);
}

/**
 * Under `fire.lock.takeover`, judges the lock again: it is removed only when it is still stale and
 * still the same inode. Judging again (not only comparing inodes) also covers a file system that
 * reuses the inode number of a lock another process removed and recreated in the meantime.
 */
async function takeOverStaleLock(location: ScheduleLocation, stale: LockIdentity, pid: number, nowMs: number): Promise<boolean> {
  const lockPath = scheduleFilePath(location, 'fireLock');
  const takeoverPath = scheduleFilePath(location, 'fireLockTakeover');
  if (!(await acquireTakeover(takeoverPath, pid, nowMs))) return false;
  try {
    const again = await lockOwner(lockPath, pid, nowMs);
    if (again.state !== 'stale' || !sameIdentity(again.identity, stale)) return false;
    await removeIfPresent(lockPath);
    return await createExclusive(lockPath, `${pid}\n`);
  } finally {
    await removeIfPresent(takeoverPath);
  }
}

function heldBy(owner: LockOwner): FireLockResult {
  return { state: 'held', pid: owner.state === 'live' ? owner.pid : null };
}

/**
 * Takes the schedule's fire lock for `pid`. A lock left by this pid (a write that threw) is still
 * this process's. A stale lock (dead owner, older than `staleMs`, or with no pid past
 * `unreadableStaleMs`) is taken over under `fire.lock.takeover`; losing that race reports `held`.
 */
export async function acquireFireLock(location: ScheduleLocation, pid: number, nowMs = Date.now()): Promise<FireLockResult> {
  const lockPath = scheduleFilePath(location, 'fireLock');
  if (await createExclusive(lockPath, `${pid}\n`)) return { state: 'acquired' };
  const owner = await lockOwner(lockPath, pid, nowMs);
  if (owner.state === 'own') return { state: 'acquired' };
  if (owner.state === 'live') return heldBy(owner);
  if (owner.state === 'absent') {
    return (await createExclusive(lockPath, `${pid}\n`)) ? { state: 'acquired' } : heldBy(await lockOwner(lockPath, pid, nowMs));
  }
  if (await takeOverStaleLock(location, owner.identity, pid, nowMs)) return { state: 'acquired' };
  return heldBy(await lockOwner(lockPath, pid, nowMs));
}

/** Removes the lock only when `pid` still holds it; another owner's lock is never touched. */
export async function releaseFireLock(location: ScheduleLocation, pid: number, nowMs = Date.now()): Promise<void> {
  const lockPath = scheduleFilePath(location, 'fireLock');
  const owner = await lockOwner(lockPath, pid, nowMs);
  if (owner.state === 'own') await removeIfPresent(lockPath);
}
