import { closeSync, constants, openSync, readFileSync, unlinkSync } from 'node:fs';
import { lstat, mkdir, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { BOOT_TIME_TOLERANCE_MS, currentBootTimeMs, formatProcessStamp, isStampAlive, parseProcessStamp } from '@studio/shared/run-files';

/*
 * `<data home>/logs/watcher.lock` (RUN-FORMAT section 14, baseline review "single-instance lock"):
 * one watcher daemon per data home. Two daemons could both claim one run, double paid calls and lose
 * `cost.json` entries, and a new one would fail a curation the other is still collecting.
 *
 * The lock is created with O_EXCL and holds the owner's process stamp (`<pid> <bootTimeMs>`). It is
 * taken over only when its holder is provably gone: another boot, no live process of this user, or
 * this process's own pid (an earlier life of the pid). A lock with no readable stamp counts as gone
 * once it predates this boot or is older than `UNREADABLE_STALE_MS` (its creator died between the
 * create and the write). Taking over is serialized by `watcher.lock.takeover` (O_EXCL), and the stale
 * lock is removed only while it is still the same inode that was judged stale, as `fire.lock` does.
 */

export const WATCHER_LOCK_FILE_NAME = 'watcher.lock';
const TAKEOVER_SUFFIX = '.takeover';
const LOCK_FILE_MODE = 0o600;
const LOGS_DIRECTORY_MODE = 0o700;
/** A stamp line is at most 23 bytes; anything larger was not written here. */
const MAX_LOCK_BYTES = 64;
/** The create and the stamp write are microseconds apart; a lock still empty after this is a crashed create. */
export const UNREADABLE_STALE_MS = 10_000;

interface LockIdentity {
  dev: number;
  ino: number;
}

type LockHolder = { state: 'absent' } | { state: 'live'; pid: number | null } | { state: 'stale'; identity: LockIdentity };

export interface WatcherLockOptions {
  /** This process's pid. */
  pid: number;
  /** Fixed clock and boot time for tests; default to the machine's. */
  nowMs?: number;
  bootTimeMs?: number;
}

/** `acquired`: this process holds the lock. `held`: a live watcher does (pid null when unreadable). */
export type WatcherLockResult = { state: 'acquired'; lock: WatcherInstanceLock } | { state: 'held'; pid: number | null };

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

/** A short code for a log line, never a message (messages name paths). */
function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : 'unknown';
}

async function createExclusive(filePath: string, content: string): Promise<boolean> {
  let handle;
  try {
    handle = await open(filePath, 'wx', LOCK_FILE_MODE);
  } catch (error) {
    if (hasCode(error, 'EEXIST')) return false;
    throw error;
  }
  try {
    await handle.writeFile(content, { encoding: 'utf8' });
    await handle.sync();
  } catch (error) {
    await handle.close();
    // This process created the file and it holds no stamp, so it removes it again.
    await removeIfPresent(filePath);
    throw error;
  }
  await handle.close();
  return true;
}

async function removeIfPresent(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    if (!hasCode(error, 'ENOENT')) throw error;
  }
}

/** A link at the lock path is stale, identified by the link itself. */
async function staleByPath(lockPath: string): Promise<LockHolder> {
  try {
    const stats = await lstat(lockPath);
    return { state: 'stale', identity: { dev: stats.dev, ino: stats.ino } };
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return { state: 'absent' };
    throw error;
  }
}

/** Never follows a link and never blocks on a FIFO; a lock that is not a small regular file is stale. */
async function lockHolder(lockPath: string, options: Required<WatcherLockOptions>): Promise<LockHolder> {
  let handle;
  try {
    handle = await open(lockPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return { state: 'absent' };
    if (hasCode(error, 'ELOOP')) return staleByPath(lockPath);
    throw error;
  }
  let text: string;
  let mtimeMs: number;
  let identity: LockIdentity;
  try {
    const stats = await handle.stat();
    identity = { dev: stats.dev, ino: stats.ino };
    if (!stats.isFile() || stats.size > MAX_LOCK_BYTES) return { state: 'stale', identity };
    mtimeMs = stats.mtimeMs;
    text = await handle.readFile({ encoding: 'utf8' });
  } finally {
    await handle.close();
  }
  const stamp = parseProcessStamp(text);
  // This module always writes a boot time, so a lock without one is treated like an unreadable lock.
  if (stamp === null || stamp.bootTimeMs === null) {
    const fromEarlierBoot = mtimeMs < options.bootTimeMs - BOOT_TIME_TOLERANCE_MS;
    return fromEarlierBoot || options.nowMs - mtimeMs > UNREADABLE_STALE_MS ? { state: 'stale', identity } : { state: 'live', pid: null };
  }
  const alive = isStampAlive(stamp, { selfPid: options.pid, bootTimeMs: options.bootTimeMs });
  return alive ? { state: 'live', pid: stamp.pid } : { state: 'stale', identity };
}

function sameIdentity(left: LockIdentity, right: LockIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

/** One left by a process that died inside its few file operations is removed once it is old. */
async function acquireTakeover(takeoverPath: string, options: Required<WatcherLockOptions>): Promise<boolean> {
  const content = formatProcessStamp(options.pid, options.bootTimeMs);
  if (await createExclusive(takeoverPath, content)) return true;
  try {
    const stats = await lstat(takeoverPath);
    if (options.nowMs - stats.mtimeMs <= UNREADABLE_STALE_MS) return false;
  } catch (error) {
    if (!hasCode(error, 'ENOENT')) throw error;
  }
  await removeIfPresent(takeoverPath);
  return createExclusive(takeoverPath, content);
}

/** Under the takeover file, judges the lock again and replaces it only while it is the same stale inode. */
async function takeOverStaleLock(lockPath: string, stale: LockIdentity, options: Required<WatcherLockOptions>): Promise<boolean> {
  const takeoverPath = `${lockPath}${TAKEOVER_SUFFIX}`;
  if (!(await acquireTakeover(takeoverPath, options))) return false;
  try {
    const again = await lockHolder(lockPath, options);
    if (again.state === 'live') return false;
    if (again.state === 'stale') {
      if (!sameIdentity(again.identity, stale)) return false;
      await removeIfPresent(lockPath);
    }
    return await createExclusive(lockPath, formatProcessStamp(options.pid, options.bootTimeMs));
  } finally {
    await removeIfPresent(takeoverPath);
  }
}

function readLockSync(lockPath: string): string {
  const descriptor = openSync(lockPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    return readFileSync(descriptor, { encoding: 'utf8' });
  } finally {
    closeSync(descriptor);
  }
}

/**
 * The lock this process holds. `release` and `releaseSync` remove the file only while it still holds
 * this process's stamp, so a lock another watcher took over is never touched.
 */
export class WatcherInstanceLock {
  private released = false;

  constructor(
    readonly lockPath: string,
    private readonly stampText: string,
  ) {}

  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    let handle;
    try {
      handle = await open(this.lockPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    } catch (error) {
      if (hasCode(error, 'ENOENT') || hasCode(error, 'ELOOP')) return;
      throw error;
    }
    let text: string;
    try {
      text = await handle.readFile({ encoding: 'utf8' });
    } finally {
      await handle.close();
    }
    if (text === this.stampText) await removeIfPresent(this.lockPath);
  }

  /** For `process.on('exit')`, where only synchronous work runs (a forced or fatal exit). */
  releaseSync(): void {
    if (this.released) return;
    this.released = true;
    try {
      if (readLockSync(this.lockPath) === this.stampText) unlinkSync(this.lockPath);
    } catch (error) {
      if (hasCode(error, 'ENOENT') || hasCode(error, 'ELOOP')) return;
      // Exit path, no logger left: a lock left behind is judged stale by the next start.
      process.stderr.write(`${JSON.stringify({ level: 'warn', event: 'watcher.lock-not-released', code: errorCode(error) })}\n`);
    }
  }
}

/**
 * Takes `<logsDirectory>/watcher.lock` for this process. A stale lock is taken over under the
 * takeover file; losing that race, or finding a live holder, reports `held`.
 */
export async function acquireWatcherInstanceLock(logsDirectory: string, options: WatcherLockOptions): Promise<WatcherLockResult> {
  const resolved: Required<WatcherLockOptions> = {
    pid: options.pid,
    nowMs: options.nowMs ?? Date.now(),
    bootTimeMs: options.bootTimeMs ?? currentBootTimeMs(),
  };
  await mkdir(logsDirectory, { recursive: true, mode: LOGS_DIRECTORY_MODE });
  const lockPath = join(logsDirectory, WATCHER_LOCK_FILE_NAME);
  const stampText = formatProcessStamp(resolved.pid, resolved.bootTimeMs);
  const acquired = (): WatcherLockResult => ({ state: 'acquired', lock: new WatcherInstanceLock(lockPath, stampText) });

  if (await createExclusive(lockPath, stampText)) return acquired();
  const holder = await lockHolder(lockPath, resolved);
  if (holder.state === 'live') return { state: 'held', pid: holder.pid };
  if (holder.state === 'absent') {
    if (await createExclusive(lockPath, stampText)) return acquired();
  } else if (await takeOverStaleLock(lockPath, holder.identity, resolved)) {
    return acquired();
  }
  const now = await lockHolder(lockPath, resolved);
  return { state: 'held', pid: now.state === 'live' ? now.pid : null };
}
