import assert from 'node:assert/strict';
import { mkdir, mkdtemp, open, readdir, readFile, rm, stat, symlink, writeFile, type FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { RunFileWriteError } from '../../run-files/errors';
import { newUlid } from '../../run-files/ulid';
import { SchedulePathError, slotClaimPath, type ScheduleLocation } from './paths';
import { claimSlot, releaseSlotClaim } from './slot-claim';

/*
 * Per-slot fire claims `schedules/<id>/fired/<slotMs>` (SPEC 0006 section 4.6, R3 security
 * re-review 2): the claim is what keeps a slot from being fired twice when `fire.lock` is ever
 * held by two processes at once.
 */

interface Fixture {
  root: string;
  location: ScheduleLocation;
}

const slotAt = new Date('2026-11-19T09:00:00.000Z');

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'schedule-slot-claim-'));
  const schedulesRoot = join(root, 'schedules');
  const location: ScheduleLocation = { schedulesRoot, scheduleId: newUlid(Date.parse('2026-11-01T00:00:00.000Z')) };
  await mkdir(join(schedulesRoot, location.scheduleId), { recursive: true });
  return { root, location };
}

describe('claimSlot / releaseSlotClaim', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture();
  });

  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it('claims a slot once: the file names this pid, mode 600, in a folder of mode 700', async () => {
    const claimPath = slotClaimPath(fixture.location, slotAt);
    assert.equal(claimPath, join(fixture.root, 'schedules', fixture.location.scheduleId, 'fired', String(slotAt.getTime())));

    assert.equal(await claimSlot(fixture.location, slotAt, process.pid), 'claimed');
    assert.equal(await readFile(claimPath, 'utf8'), `${process.pid}\n`);
    assert.equal((await stat(claimPath)).mode & 0o777, 0o600);
    assert.equal((await stat(dirname(claimPath))).mode & 0o777, 0o700);
  });

  it('reports taken for a second claim of the same slot, by any pid, and leaves the first claim', async () => {
    assert.equal(await claimSlot(fixture.location, slotAt, process.pid), 'claimed');

    assert.equal(await claimSlot(fixture.location, slotAt, process.pid), 'taken');
    assert.equal(await claimSlot(fixture.location, slotAt, process.ppid), 'taken');
    assert.equal(await readFile(slotClaimPath(fixture.location, slotAt), 'utf8'), `${process.pid}\n`);
  });

  it('lets exactly one of many concurrent claims of one slot win', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => claimSlot(fixture.location, slotAt, process.pid)));

    assert.equal(results.filter((result) => result === 'claimed').length, 1);
  });

  it('claims different slots of one schedule independently', async () => {
    assert.equal(await claimSlot(fixture.location, slotAt, process.pid), 'claimed');
    assert.equal(await claimSlot(fixture.location, new Date(slotAt.getTime() + 60_000), process.pid), 'claimed');
  });

  it('gives back only a claim naming this pid', async () => {
    const claimPath = slotClaimPath(fixture.location, slotAt);
    await mkdir(dirname(claimPath), { recursive: true });
    await writeFile(claimPath, `${process.ppid}\n`);

    await releaseSlotClaim(fixture.location, slotAt, process.pid);
    assert.equal(await readFile(claimPath, 'utf8'), `${process.ppid}\n`);

    await rm(claimPath);
    assert.equal(await claimSlot(fixture.location, slotAt, process.pid), 'claimed');
    await releaseSlotClaim(fixture.location, slotAt, process.pid);
    await assert.rejects(stat(claimPath), { code: 'ENOENT' });
    assert.equal(await claimSlot(fixture.location, slotAt, process.pid), 'claimed');
  });

  it('does nothing when giving back a claim that does not exist', async () => {
    await releaseSlotClaim(fixture.location, slotAt, process.pid);
  });

  it('treats a symlink at the claim path as taken and never removes it or its target', async () => {
    const claimPath = slotClaimPath(fixture.location, slotAt);
    const target = join(fixture.root, 'outside.txt');
    await writeFile(target, `${process.pid}\n`);
    await mkdir(dirname(claimPath), { recursive: true });
    await symlink(target, claimPath);

    assert.equal(await claimSlot(fixture.location, slotAt, process.pid), 'taken');
    await releaseSlotClaim(fixture.location, slotAt, process.pid);
    assert.ok((await stat(claimPath)).isFile());
    assert.equal(await readFile(target, 'utf8'), `${process.pid}\n`);
  });

  it('removes a claim it could not fill, so the slot can still fire (re-review 3 I-1)', async () => {
    const claimPath = slotClaimPath(fixture.location, slotAt);
    const probe = await open(join(fixture.root, 'probe'), 'w');
    // Every FileHandle shares this prototype, so the claim's own handle gets the failing write.
    const fileHandlePrototype: FileHandle = Object.getPrototypeOf(probe);
    await probe.close();
    const failingWrite = mock.method(fileHandlePrototype, 'writeFile', async () => {
      throw Object.assign(new Error('no space left'), { code: 'ENOSPC' });
    });
    try {
      await assert.rejects(claimSlot(fixture.location, slotAt, process.pid), RunFileWriteError);
    } finally {
      failingWrite.mock.restore();
    }

    await assert.rejects(stat(claimPath), { code: 'ENOENT' });
    assert.equal(await claimSlot(fixture.location, slotAt, process.pid), 'claimed');
  });

  it('refuses a fired/ that is a file, by name (re-review 3 I-2)', async () => {
    const folder = dirname(slotClaimPath(fixture.location, slotAt));
    await writeFile(folder, 'not a folder');

    await assert.rejects(claimSlot(fixture.location, slotAt, process.pid), SchedulePathError);
  });

  it('refuses a fired/ that is a symlink and writes nothing through it (re-review 3 I-3)', async () => {
    const folder = dirname(slotClaimPath(fixture.location, slotAt));
    const elsewhere = join(fixture.root, 'elsewhere');
    await mkdir(elsewhere);
    await symlink(elsewhere, folder);

    await assert.rejects(claimSlot(fixture.location, slotAt, process.pid), SchedulePathError);
    assert.deepEqual(await readdir(elsewhere), []);
  });

  it('refuses a slot instant that is not a whole, non-negative millisecond', async () => {
    for (const bad of [new Date(Number.NaN), new Date(-1)]) {
      assert.throws(() => slotClaimPath(fixture.location, bad), SchedulePathError);
      await assert.rejects(claimSlot(fixture.location, bad, process.pid), SchedulePathError);
    }
  });
});
