import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFile, mkdir, mkdtemp, readFile, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { newUlid } from '../../run-files/ulid';
import { fireLockBounds } from '../constants';
import { type SlotLine } from '../slot-log';
import { acquireFireLock, releaseFireLock } from './fire-lock';
import { scheduleFilePath, type ScheduleLocation } from './paths';
import { appendSlotLine, readSlotLineTail } from './schedule-files';

/*
 * `fire.lock` and the `slots.jsonl` tail read (SPEC 0006 section 4.6, OD4 single run writer; R3
 * security review L1 and L2). The parent of the test process stands in for a second live watcher;
 * a process that already exited stands in for a crashed one.
 */

interface Fixture {
  root: string;
  location: ScheduleLocation;
  lockPath: string;
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'schedule-fire-lock-'));
  const schedulesRoot = join(root, 'schedules');
  const location: ScheduleLocation = { schedulesRoot, scheduleId: newUlid(Date.parse('2026-11-01T00:00:00.000Z')) };
  await mkdir(join(schedulesRoot, location.scheduleId), { recursive: true });
  return { root, location, lockPath: scheduleFilePath(location, 'fireLock') };
}

function exitedPid(): number {
  const child = spawnSync(process.execPath, ['-e', '0']);
  assert.ok(child.pid !== undefined && child.pid > 0);
  return child.pid;
}

async function age(filePath: string, ms: number): Promise<void> {
  const past = new Date(Date.now() - ms);
  await utimes(filePath, past, past);
}

describe('acquireFireLock / releaseFireLock', () => {
  let fixture: Fixture;
  const livePid = process.ppid;

  beforeEach(async () => {
    fixture = await createFixture();
  });

  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it('creates the lock with this pid, mode 600, and removes it on release', async () => {
    assert.deepEqual(await acquireFireLock(fixture.location, process.pid), { state: 'acquired' });
    assert.equal(await readFile(fixture.lockPath, 'utf8'), `${process.pid}\n`);
    assert.equal((await stat(fixture.lockPath)).mode & 0o777, 0o600);

    await releaseFireLock(fixture.location, process.pid);
    await assert.rejects(stat(fixture.lockPath), { code: 'ENOENT' });
  });

  it('reports held while another live process owns the lock, and never removes its lock', async () => {
    await writeFile(fixture.lockPath, `${livePid}\n`);

    assert.deepEqual(await acquireFireLock(fixture.location, process.pid), { state: 'held', pid: livePid });
    await releaseFireLock(fixture.location, process.pid);
    assert.equal(await readFile(fixture.lockPath, 'utf8'), `${livePid}\n`);
  });

  it('treats a lock left by this pid as its own', async () => {
    await writeFile(fixture.lockPath, `${process.pid}\n`);
    assert.deepEqual(await acquireFireLock(fixture.location, process.pid), { state: 'acquired' });
  });

  it('takes over a lock whose owner is no longer running', async () => {
    await writeFile(fixture.lockPath, `${exitedPid()}\n`);

    assert.deepEqual(await acquireFireLock(fixture.location, process.pid), { state: 'acquired' });
    assert.equal(await readFile(fixture.lockPath, 'utf8'), `${process.pid}\n`);
  });

  it('takes over a live-looking lock older than staleMs (pid reuse)', async () => {
    await writeFile(fixture.lockPath, `${livePid}\n`);
    await age(fixture.lockPath, fireLockBounds.staleMs + 60_000);

    assert.deepEqual(await acquireFireLock(fixture.location, process.pid), { state: 'acquired' });
  });

  it('waits on a fresh lock with no pid yet, and takes it once it is older than unreadableStaleMs', async () => {
    await writeFile(fixture.lockPath, '');
    assert.deepEqual(await acquireFireLock(fixture.location, process.pid), { state: 'held', pid: null });

    await age(fixture.lockPath, fireLockBounds.unreadableStaleMs + 1_000);
    assert.deepEqual(await acquireFireLock(fixture.location, process.pid), { state: 'acquired' });
  });

  for (const oversized of ['9999999', '9999999999']) {
    it(`treats pid ${oversized} (above the platform maximum) as no pid: held while fresh, taken once aged`, async () => {
      await writeFile(fixture.lockPath, `${oversized}\n`);

      // A fresh lock with no usable pid is someone's create in progress, never a crash.
      assert.deepEqual(await acquireFireLock(fixture.location, process.pid), { state: 'held', pid: null });
      assert.equal(await readFile(fixture.lockPath, 'utf8'), `${oversized}\n`);

      await age(fixture.lockPath, fireLockBounds.unreadableStaleMs + 1_000);
      assert.deepEqual(await acquireFireLock(fixture.location, process.pid), { state: 'acquired' });
    });
  }

  it('smoke: two concurrent takeovers of one stale lock never both acquire (re-review M1; interleaving is not forced)', async () => {
    for (let round = 0; round < 25; round += 1) {
      await writeFile(fixture.lockPath, `${exitedPid()}\n`);
      // This process and its parent stand in for two live daemons that judged the lock at once.
      const results = await Promise.all([acquireFireLock(fixture.location, process.pid), acquireFireLock(fixture.location, livePid)]);

      assert.equal(results.filter((result) => result.state === 'acquired').length, 1, `round ${round}: ${JSON.stringify(results)}`);
      const winner = results[0]?.state === 'acquired' ? process.pid : livePid;
      assert.equal((await readFile(fixture.lockPath, 'utf8')).trim(), String(winner), 'the lock names the process told acquired');
      await assert.rejects(stat(scheduleFilePath(fixture.location, 'fireLockTakeover')), { code: 'ENOENT' });
      await rm(fixture.lockPath);
    }
  });

  it('waits while a fresh takeover is in progress and clears one left by a crash', async () => {
    await writeFile(fixture.lockPath, `${exitedPid()}\n`);
    const takeoverPath = scheduleFilePath(fixture.location, 'fireLockTakeover');
    await writeFile(takeoverPath, `${livePid}\n`);

    assert.equal((await acquireFireLock(fixture.location, process.pid)).state, 'held');

    await age(takeoverPath, fireLockBounds.unreadableStaleMs + 1_000);
    assert.deepEqual(await acquireFireLock(fixture.location, process.pid), { state: 'acquired' });
    await assert.rejects(stat(takeoverPath), { code: 'ENOENT' });
  });

  it('replaces a symlink at the lock path without touching its target', async () => {
    const target = join(fixture.root, 'elsewhere.txt');
    await writeFile(target, 'keep\n');
    await symlink(target, fixture.lockPath);

    assert.deepEqual(await acquireFireLock(fixture.location, process.pid), { state: 'acquired' });
    assert.equal(await readFile(target, 'utf8'), 'keep\n');
    assert.equal(await readFile(fixture.lockPath, 'utf8'), `${process.pid}\n`);
  });
});

describe('readSlotLineTail', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture();
  });

  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  function missedLine(slotAt: string): SlotLine {
    return { slotAt, decidedAt: slotAt, result: 'missed', reasonId: 'watcher-not-running', runId: null, briefId: null };
  }

  it('reads nothing when slots.jsonl does not exist', async () => {
    assert.deepEqual(await readSlotLineTail(fixture.location), { lines: [], unreadableLines: 0 });
  });

  it('returns whole lines only when the tail starts inside a line', async () => {
    const slots = ['2026-11-20T12:00:00.000Z', '2026-11-21T12:00:00.000Z', '2026-11-22T12:00:00.000Z'];
    for (const slotAt of slots) await appendSlotLine(fixture.location, missedLine(slotAt));
    const lineBytes = Buffer.byteLength(`${JSON.stringify(missedLine(slots[0] ?? ''))}\n`);

    const tail = await readSlotLineTail(fixture.location, lineBytes + 10);

    assert.deepEqual(
      tail.lines.map((line) => line.slotAt),
      ['2026-11-22T12:00:00.000Z'],
    );
    assert.equal((await readSlotLineTail(fixture.location)).lines.length, 3);
  });

  it('passes over a line damaged by a partial append instead of failing (re-review L1-new)', async () => {
    await appendSlotLine(fixture.location, missedLine('2026-11-20T12:00:00.000Z'));
    // A partial append (no newline), then the next append joined onto it: one unparseable line.
    await appendFile(scheduleFilePath(fixture.location, 'slots'), '{"slotAt":"2026-11-21T1');
    await appendSlotLine(fixture.location, missedLine('2026-11-22T12:00:00.000Z'));
    await appendSlotLine(fixture.location, missedLine('2026-11-23T12:00:00.000Z'));

    const tail = await readSlotLineTail(fixture.location);

    assert.deepEqual(
      tail.lines.map((line) => line.slotAt),
      ['2026-11-20T12:00:00.000Z', '2026-11-23T12:00:00.000Z'],
    );
    assert.equal(tail.unreadableLines, 1);
  });
});
