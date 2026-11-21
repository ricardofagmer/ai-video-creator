import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { tokenLockBounds } from '../constants';
import { accountFilePath } from './paths';
import { acquireTokenLock, holdsTokenLock, releaseTokenLock } from './token-lock';

/*
 * `token.lock` (SPEC 0007 section 5.3): one refresher per platform across the api, the CLI and the
 * watcher. The parent of the test process stands in for another live process; a process that
 * already exited stands in for a crashed one.
 */

interface Fixture {
  root: string;
  platformRoot: string;
  lockPath: string;
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'platform-token-lock-'));
  const platformRoot = join(root, 'platform');
  await mkdir(platformRoot);
  return { root, platformRoot, lockPath: accountFilePath(platformRoot, 'youtube', 'tokenLock') };
}

function exitedPid(): number {
  const child = spawnSync(process.execPath, ['-e', '0']);
  assert.ok(child.pid !== undefined && child.pid > 0);
  return child.pid;
}

describe('acquireTokenLock / releaseTokenLock', () => {
  let fixture: Fixture;
  const livePid = process.ppid;

  beforeEach(async () => {
    fixture = await createFixture();
  });

  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it('creates the lock with this pid, mode 600, inside a 700 account folder, and removes it on release', async () => {
    const result = await acquireTokenLock({ platformRoot: fixture.platformRoot, platform: 'youtube', pid: process.pid });

    assert.deepEqual(result, { state: 'acquired' });
    assert.equal(await readFile(fixture.lockPath, 'utf8'), `${process.pid}\n`);
    assert.equal((await stat(fixture.lockPath)).mode & 0o777, 0o600);
    assert.equal((await stat(join(fixture.platformRoot, 'accounts', 'youtube'))).mode & 0o777, 0o700);

    await releaseTokenLock({ platformRoot: fixture.platformRoot, platform: 'youtube', pid: process.pid });
    await assert.rejects(stat(fixture.lockPath), { code: 'ENOENT' });
  });

  it('reports held while another live process owns a fresh lock, and release by another pid keeps it', async () => {
    await acquireTokenLock({ platformRoot: fixture.platformRoot, platform: 'youtube', pid: livePid });

    const result = await acquireTokenLock({ platformRoot: fixture.platformRoot, platform: 'youtube', pid: process.pid });
    assert.deepEqual(result, { state: 'held', pid: livePid });

    await releaseTokenLock({ platformRoot: fixture.platformRoot, platform: 'youtube', pid: process.pid });
    assert.equal(await readFile(fixture.lockPath, 'utf8'), `${livePid}\n`);
  });

  it('reports held for a fresh lock even when the same pid asks twice', async () => {
    await acquireTokenLock({ platformRoot: fixture.platformRoot, platform: 'youtube', pid: process.pid });
    const second = await acquireTokenLock({ platformRoot: fixture.platformRoot, platform: 'youtube', pid: process.pid });
    assert.deepEqual(second, { state: 'held', pid: process.pid });
  });

  it('keeps platforms independent', async () => {
    await acquireTokenLock({ platformRoot: fixture.platformRoot, platform: 'youtube', pid: livePid });
    const tiktok = await acquireTokenLock({ platformRoot: fixture.platformRoot, platform: 'tiktok', pid: process.pid });
    assert.deepEqual(tiktok, { state: 'acquired' });
  });

  it('takes over a lock whose owner is no longer running', async () => {
    await acquireTokenLock({ platformRoot: fixture.platformRoot, platform: 'youtube', pid: exitedPid() });

    const result = await acquireTokenLock({ platformRoot: fixture.platformRoot, platform: 'youtube', pid: process.pid });
    assert.deepEqual(result, { state: 'acquired' });
    assert.equal(await readFile(fixture.lockPath, 'utf8'), `${process.pid}\n`);
  });

  it('takes over a live owner lock older than the stale bound, and not one just inside it', async () => {
    const createdAtMs = Date.now();
    await acquireTokenLock({ platformRoot: fixture.platformRoot, platform: 'youtube', pid: livePid, nowMs: createdAtMs });

    const inside = await acquireTokenLock({
      platformRoot: fixture.platformRoot,
      platform: 'youtube',
      pid: process.pid,
      nowMs: createdAtMs + tokenLockBounds.staleMs - 5_000,
    });
    assert.deepEqual(inside, { state: 'held', pid: livePid });

    const past = await acquireTokenLock({
      platformRoot: fixture.platformRoot,
      platform: 'youtube',
      pid: process.pid,
      nowMs: createdAtMs + tokenLockBounds.staleMs + 5_000,
    });
    assert.deepEqual(past, { state: 'acquired' });
  });

  it('treats a symlink at the lock path as stale and never writes through it', async () => {
    const target = join(fixture.root, 'outside.txt');
    await writeFile(target, 'untouched');
    await mkdir(join(fixture.platformRoot, 'accounts', 'youtube'), { recursive: true });
    await symlink(target, fixture.lockPath);

    const result = await acquireTokenLock({ platformRoot: fixture.platformRoot, platform: 'youtube', pid: process.pid });

    assert.deepEqual(result, { state: 'acquired' });
    assert.equal(await readFile(target, 'utf8'), 'untouched');
    assert.equal(await readFile(fixture.lockPath, 'utf8'), `${process.pid}\n`);
  });

  it('treats a lock whose owner pid belongs to another user (EPERM) as stale and takes it over', async () => {
    // Never signalled: `process.kill` is stubbed, answering EPERM for this pid only.
    const otherUserPid = 424_242;
    mock.method(process, 'kill', (pid: number) => {
      if (pid === otherUserPid) throw Object.assign(new Error('stubbed EPERM'), { code: 'EPERM' });
      return true;
    });
    try {
      await mkdir(join(fixture.platformRoot, 'accounts', 'youtube'), { recursive: true, mode: 0o700 });
      await writeFile(fixture.lockPath, `${otherUserPid}\n`, { mode: 0o600 });

      const result = await acquireTokenLock({ platformRoot: fixture.platformRoot, platform: 'youtube', pid: process.pid });

      assert.deepEqual(result, { state: 'acquired' });
      assert.equal(await readFile(fixture.lockPath, 'utf8'), `${process.pid}\n`);
    } finally {
      mock.restoreAll();
    }
  });

  it('release is a no-op when no lock exists', async () => {
    await releaseTokenLock({ platformRoot: fixture.platformRoot, platform: 'instagram', pid: process.pid });
    await assert.rejects(stat(accountFilePath(fixture.platformRoot, 'instagram', 'tokenLock')), { code: 'ENOENT' });
  });
});

describe('holdsTokenLock (S1, C5)', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture();
  });

  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it('answers true for the pid that holds a fresh lock', async () => {
    await acquireTokenLock({ platformRoot: fixture.platformRoot, platform: 'youtube', pid: process.pid });
    assert.equal(await holdsTokenLock({ platformRoot: fixture.platformRoot, platform: 'youtube', pid: process.pid }), true);
  });

  it('answers false when another live process holds the lock', async () => {
    await acquireTokenLock({ platformRoot: fixture.platformRoot, platform: 'youtube', pid: process.ppid });
    assert.equal(await holdsTokenLock({ platformRoot: fixture.platformRoot, platform: 'youtube', pid: process.pid }), false);
  });

  it('answers false once the lock is stale, even for its own holder', async () => {
    const createdAtMs = Date.now();
    await acquireTokenLock({ platformRoot: fixture.platformRoot, platform: 'youtube', pid: process.pid, nowMs: createdAtMs });

    const held = await holdsTokenLock({
      platformRoot: fixture.platformRoot,
      platform: 'youtube',
      pid: process.pid,
      nowMs: createdAtMs + tokenLockBounds.staleMs + 5_000,
    });
    assert.equal(held, false);
  });

  it('answers false when the lock was removed or never taken', async () => {
    assert.equal(await holdsTokenLock({ platformRoot: fixture.platformRoot, platform: 'youtube', pid: process.pid }), false);
    await acquireTokenLock({ platformRoot: fixture.platformRoot, platform: 'youtube', pid: process.pid });
    await releaseTokenLock({ platformRoot: fixture.platformRoot, platform: 'youtube', pid: process.pid });
    assert.equal(await holdsTokenLock({ platformRoot: fixture.platformRoot, platform: 'youtube', pid: process.pid }), false);
  });

  it('answers false after another process took the lock over', async () => {
    await acquireTokenLock({ platformRoot: fixture.platformRoot, platform: 'youtube', pid: process.pid });
    await writeFile(fixture.lockPath, `${process.ppid}\n`);
    assert.equal(await holdsTokenLock({ platformRoot: fixture.platformRoot, platform: 'youtube', pid: process.pid }), false);
  });

  it('answers false for a symlink at the lock path', async () => {
    const target = join(fixture.root, 'outside.txt');
    await writeFile(target, `${process.pid}\n`);
    await mkdir(join(fixture.platformRoot, 'accounts', 'youtube'), { recursive: true });
    await symlink(target, fixture.lockPath);
    assert.equal(await holdsTokenLock({ platformRoot: fixture.platformRoot, platform: 'youtube', pid: process.pid }), false);
  });
});
