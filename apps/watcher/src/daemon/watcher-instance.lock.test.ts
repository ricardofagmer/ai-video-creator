import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { UNREADABLE_STALE_MS, WATCHER_LOCK_FILE_NAME, acquireWatcherInstanceLock } from './watcher-instance.lock';

/*
 * Single-instance lock (baseline review): one watcher per data home. The lock is taken over only
 * when its holder is provably gone. Every case runs in a temp `logs/` folder with a fixed clock and
 * boot time. A live holder is this test runner itself (signal 0 to one's own pid); a dead holder is
 * a stubbed `process.kill`, so no other process is ever signalled.
 */

const BOOT_TIME_MS = 1_763_600_000_000;
const NOW_MS = BOOT_TIME_MS + 3_600_000;
const OTHER_BOOT_MS = BOOT_TIME_MS - 86_400_000;
const SELF_PID = 515_151;
const OTHER_PID = 424_242;

let logsDir: string;

function lockPath(): string {
  return join(logsDir, WATCHER_LOCK_FILE_NAME);
}

function options(overrides: { pid?: number; nowMs?: number } = {}) {
  return { pid: overrides.pid ?? SELF_PID, nowMs: overrides.nowMs ?? NOW_MS, bootTimeMs: BOOT_TIME_MS };
}

function errorWithCode(code: string): Error {
  return Object.assign(new Error(`stubbed ${code}`), { code });
}

beforeEach(async () => {
  logsDir = join(await mkdtemp(join(tmpdir(), 'watcher-lock-')), 'logs');
});

afterEach(async () => {
  mock.restoreAll();
  await rm(join(logsDir, '..'), { recursive: true, force: true });
});

describe('acquireWatcherInstanceLock', () => {
  it('creates the logs folder and the lock with this process stamp', async () => {
    const result = await acquireWatcherInstanceLock(logsDir, options());
    assert.equal(result.state, 'acquired');
    assert.equal(await readFile(lockPath(), 'utf8'), `${SELF_PID} ${BOOT_TIME_MS}\n`);
  });

  it('refuses while a live watcher of this boot holds it', async () => {
    await acquireWatcherInstanceLock(logsDir, options({ pid: process.pid }));
    const second = await acquireWatcherInstanceLock(logsDir, options());
    assert.deepEqual(second, { state: 'held', pid: process.pid });
    assert.equal(await readFile(lockPath(), 'utf8'), `${process.pid} ${BOOT_TIME_MS}\n`);
  });

  it('takes over a lock written under another boot, without signalling its pid', async () => {
    await acquireWatcherInstanceLock(logsDir, options());
    await writeFile(lockPath(), `${OTHER_PID} ${OTHER_BOOT_MS}\n`);
    const kill = mock.method(process, 'kill', () => true);
    const result = await acquireWatcherInstanceLock(logsDir, options());
    assert.equal(result.state, 'acquired');
    assert.equal(kill.mock.callCount(), 0);
    assert.equal(await readFile(lockPath(), 'utf8'), `${SELF_PID} ${BOOT_TIME_MS}\n`);
  });

  it('takes over a lock whose holder is gone (ESRCH) or foreign (EPERM)', async () => {
    for (const code of ['ESRCH', 'EPERM']) {
      await rm(logsDir, { recursive: true, force: true });
      await acquireWatcherInstanceLock(logsDir, options({ pid: OTHER_PID }));
      mock.method(process, 'kill', () => {
        throw errorWithCode(code);
      });
      const result = await acquireWatcherInstanceLock(logsDir, options());
      assert.equal(result.state, 'acquired', code);
      mock.restoreAll();
    }
  });

  it('takes over a lock naming its own pid: an earlier life of that pid left it', async () => {
    await writeFile(join(await ensureLogs(), WATCHER_LOCK_FILE_NAME), `${SELF_PID} ${BOOT_TIME_MS}\n`);
    const result = await acquireWatcherInstanceLock(logsDir, options());
    assert.equal(result.state, 'acquired');
  });

  it('waits on a fresh lock with no stamp and takes it over once it is old', async () => {
    await writeFile(join(await ensureLogs(), WATCHER_LOCK_FILE_NAME), '');
    const fileMtimeMs = Date.now();
    const fresh = await acquireWatcherInstanceLock(logsDir, { pid: SELF_PID, nowMs: fileMtimeMs + 1_000, bootTimeMs: fileMtimeMs - 60_000 });
    assert.deepEqual(fresh, { state: 'held', pid: null });
    const old = await acquireWatcherInstanceLock(logsDir, { pid: SELF_PID, nowMs: fileMtimeMs + UNREADABLE_STALE_MS + 5_000, bootTimeMs: fileMtimeMs - 60_000 });
    assert.equal(old.state, 'acquired');
  });

  it('replaces a link at the lock path without touching its target', async () => {
    const target = join(logsDir, '..', 'target.txt');
    await ensureLogs();
    await writeFile(target, 'keep me');
    await symlink(target, lockPath());
    const result = await acquireWatcherInstanceLock(logsDir, options());
    assert.equal(result.state, 'acquired');
    assert.equal(await readFile(target, 'utf8'), 'keep me');
    assert.equal(await readFile(lockPath(), 'utf8'), `${SELF_PID} ${BOOT_TIME_MS}\n`);
  });
});

describe('WatcherInstanceLock release', () => {
  it('removes its own lock, and leaves one another watcher took over', async () => {
    const first = await acquireWatcherInstanceLock(logsDir, options());
    assert.equal(first.state, 'acquired');
    if (first.state !== 'acquired') return;
    await first.lock.release();
    await assert.rejects(readFile(lockPath(), 'utf8'), { code: 'ENOENT' });

    const second = await acquireWatcherInstanceLock(logsDir, options());
    if (second.state !== 'acquired') throw new Error('expected the lock');
    await writeFile(lockPath(), `${OTHER_PID} ${BOOT_TIME_MS}\n`);
    await second.lock.release();
    assert.equal(await readFile(lockPath(), 'utf8'), `${OTHER_PID} ${BOOT_TIME_MS}\n`);
  });

  it('releases synchronously on the exit path, only while the stamp is its own', async () => {
    const result = await acquireWatcherInstanceLock(logsDir, options());
    if (result.state !== 'acquired') throw new Error('expected the lock');
    result.lock.releaseSync();
    await assert.rejects(readFile(lockPath(), 'utf8'), { code: 'ENOENT' });
  });
});

async function ensureLogs(): Promise<string> {
  await mkdir(logsDir, { recursive: true });
  return logsDir;
}
