import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { type Platform } from '../../metrics/enums';
import { hasErrorCode } from '../../run-files/errors';
import { isOwnProcessAlive } from '../../run-files/process-identity';
import { tokenLockBounds } from '../constants';
import { createExclusive, ensureFolder, parsePid, removeIfPresent } from './fs-helpers';
import { accountDirectory, accountFilePath } from './paths';

/*
 * `platform/accounts/<platform>/token.lock` (SPEC 0007 section 5.2): every Keychain write or delete
 * of the platform's tokens holds it, in the api, the CLI or the watcher. O_EXCL create holding the
 * owner's decimal pid; stale after `tokenLockBounds.staleMs` or when its owner is gone. Unlike
 * `fire.lock` there is no takeover protocol: the finder of a stale lock removes it, but only while
 * it is still the same inode it judged stale, then tries one O_EXCL create. Losing that race
 * reports `held`; the caller tries again on its next action.
 */

/** `acquired`: this process holds the lock. `held`: another live process does. */
export type TokenLockResult = { state: 'acquired' } | { state: 'held'; pid: number | null };

interface LockIdentity {
  dev: number;
  ino: number;
}

type LockOwner = { state: 'absent' } | { state: 'live'; pid: number | null } | { state: 'stale'; identity: LockIdentity };

/** A pid line is at most 8 bytes; anything larger was not written by this helper. */
const MAX_LOCK_BYTES = 64;

async function staleLink(lockPath: string): Promise<LockOwner> {
  try {
    const stats = await lstat(lockPath);
    return { state: 'stale', identity: { dev: stats.dev, ino: stats.ino } };
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return { state: 'absent' };
    throw error;
  }
}

async function lockOwner(lockPath: string, nowMs: number): Promise<LockOwner> {
  let handle;
  try {
    handle = await open(lockPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return { state: 'absent' };
    if (hasErrorCode(error, 'ELOOP')) return staleLink(lockPath);
    throw error;
  }
  try {
    const stats = await handle.stat();
    const identity = { dev: stats.dev, ino: stats.ino };
    if (!stats.isFile() || stats.size > MAX_LOCK_BYTES) return { state: 'stale', identity };
    const ownerPid = parsePid(await handle.readFile({ encoding: 'utf8' }));
    const expired = nowMs - stats.mtimeMs > tokenLockBounds.staleMs;
    if (expired || (ownerPid !== null && !isOwnProcessAlive(ownerPid))) return { state: 'stale', identity };
    return { state: 'live', pid: ownerPid };
  } finally {
    await handle.close();
  }
}

async function sameInode(lockPath: string, identity: LockIdentity): Promise<boolean> {
  try {
    const stats = await lstat(lockPath);
    return stats.dev === identity.dev && stats.ino === identity.ino;
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return false;
    throw error;
  }
}

/**
 * Takes the platform's `token.lock` for `pid`. A live lock is `held` even when this pid holds it:
 * two requests inside one api process (a callback racing a disconnect) must exclude each other too.
 * `nowMs` is injectable so tests can fix the clock.
 */
export async function acquireTokenLock(options: {
  platformRoot: string;
  platform: Platform;
  pid: number;
  nowMs?: number;
}): Promise<TokenLockResult> {
  const nowMs = options.nowMs ?? Date.now();
  await ensureFolder(accountDirectory(options.platformRoot, options.platform));
  const lockPath = accountFilePath(options.platformRoot, options.platform, 'tokenLock');
  if (await createExclusive(lockPath, `${options.pid}\n`)) return { state: 'acquired' };
  const owner = await lockOwner(lockPath, nowMs);
  if (owner.state === 'live') return { state: 'held', pid: owner.pid };
  if (owner.state === 'stale') {
    if (!(await sameInode(lockPath, owner.identity))) return { state: 'held', pid: null };
    await removeIfPresent(lockPath);
  }
  return (await createExclusive(lockPath, `${options.pid}\n`)) ? { state: 'acquired' } : { state: 'held', pid: null };
}

/** The pid in the lock file, or null when there is no readable lock. */
async function lockFilePid(lockPath: string): Promise<number | null> {
  let handle;
  try {
    handle = await open(lockPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT') || hasErrorCode(error, 'ELOOP')) return null;
    throw error;
  }
  try {
    const stats = await handle.stat();
    return stats.isFile() && stats.size <= MAX_LOCK_BYTES ? parsePid(await handle.readFile({ encoding: 'utf8' })) : null;
  } finally {
    await handle.close();
  }
}

/**
 * Whether `pid` still holds the lock and it is not stale (findings S1, C5). A holder calls it right
 * before each Keychain write: a lock another process removed as stale, or took over, means the
 * holder must not write, because a disconnect may have deleted the item since.
 */
export async function holdsTokenLock(options: { platformRoot: string; platform: Platform; pid: number; nowMs?: number }): Promise<boolean> {
  const lockPath = accountFilePath(options.platformRoot, options.platform, 'tokenLock');
  const owner = await lockOwner(lockPath, options.nowMs ?? Date.now());
  if (owner.state !== 'live') return false;
  return (await lockFilePid(lockPath)) === options.pid;
}

/** Removes the lock only when `pid` still holds it; another owner's lock is never touched. */
export async function releaseTokenLock(options: { platformRoot: string; platform: Platform; pid: number }): Promise<void> {
  const lockPath = accountFilePath(options.platformRoot, options.platform, 'tokenLock');
  if ((await lockFilePid(lockPath)) === options.pid) await removeIfPresent(lockPath);
}
