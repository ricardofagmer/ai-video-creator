import assert from 'node:assert/strict';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { ScheduleRunsReader } from '@studio/core/schedules';
import { type ScheduleFile } from '@studio/shared/schedules';
import { scheduleFilePath, slotClaimPath } from '@studio/shared/schedules/files';
import {
  SimulatedCrashError,
  addDailySchedule,
  createHarness,
  cursorOf,
  hourMs,
  readRun,
  removeHarness,
  restartStep,
  runFolderIds,
  slotLines,
  type ScheduleHarness,
} from './schedule-step.harness.test';

/*
 * SPEC 0006 section 5.6 recovery paths through the real step: R3-AC-14 (a slot that fell due while
 * a run was executing fires late within `lateGraceMs`, else is `missed` / `watcher-busy`),
 * R3-AC-16 (a crash between the run write and the slot line does not create a second run) and
 * R3-AC-20 (a paused or deleted schedule fires nothing, and a resume replays nothing). The slot of
 * the fixture schedule is 12:00Z every day; the busy run is simulated with the tracker the daemon
 * loop wraps around `RunEngine.execute`, while the injected clock moves across the slot instant.
 */

const slotNoon = new Date('2026-11-20T12:00:00.000Z');

function withStatus(schedule: ScheduleFile, status: ScheduleFile['status'], statusSince: string): ScheduleFile {
  return { ...schedule, status, statusSince, updatedAt: statusSince };
}

describe('ScheduleStep.evaluate: a run executing at the slot instant (R3-AC-14)', () => {
  let harness: ScheduleHarness;

  beforeEach(async () => {
    harness = await createHarness('2026-11-20T11:30:00.000Z');
  });

  afterEach(async () => {
    await removeHarness(harness);
  });

  it('fires once the loop is idle when the slot is at most lateGraceMs late', async () => {
    const schedule = addDailySchedule(harness, '2026-11-20T10:00:00.000Z');
    await harness.busy.track(async () => harness.clock.set('2026-11-20T13:30:00.000Z'));

    assert.equal(await harness.step.evaluate(), true);

    const [line] = await slotLines(harness, schedule.scheduleId);
    assert.equal(line?.result, 'fired');
    assert.equal(line?.slotAt, '2026-11-20T12:00:00.000Z');
    assert.equal((await runFolderIds(harness)).length, 1);
    const slotEvent = harness.events.events.find((event) => event.type === 'schedule.slot');
    assert.ok(slotEvent !== undefined && slotEvent.type === 'schedule.slot');
    assert.equal(slotEvent.latenessMs, 1.5 * hourMs);
  });

  it('logs missed / watcher-busy and fires nothing when the run ended more than lateGraceMs after the slot', async () => {
    const schedule = addDailySchedule(harness, '2026-11-20T10:00:00.000Z');
    await harness.busy.track(async () => harness.clock.set('2026-11-20T14:30:00.000Z'));

    assert.equal(await harness.step.evaluate(), false);

    assert.deepEqual(
      (await slotLines(harness, schedule.scheduleId)).map((line) => [line.slotAt, line.result, line.reasonId]),
      [['2026-11-20T12:00:00.000Z', 'missed', 'watcher-busy']],
    );
    assert.deepEqual(await runFolderIds(harness), []);
  });

  it('logs watcher-not-running for a late slot when this process was not busy at its instant', async () => {
    const schedule = addDailySchedule(harness, '2026-11-20T10:00:00.000Z');
    harness.clock.set('2026-11-20T14:30:00.000Z');

    await harness.step.evaluate();

    assert.deepEqual(
      (await slotLines(harness, schedule.scheduleId)).map((line) => line.reasonId),
      ['watcher-not-running'],
    );
  });
});

describe('ScheduleStep.evaluate: a crash between the run write and the slot line (R3-AC-16)', () => {
  let harness: ScheduleHarness;

  beforeEach(async () => {
    harness = await createHarness('2026-11-20T12:30:00.000Z');
  });

  afterEach(async () => {
    await removeHarness(harness);
  });

  it('appends only the missing fired line on the next evaluation and never writes a second run', async () => {
    const schedule = addDailySchedule(harness, '2026-11-20T10:00:00.000Z');
    harness.slotLog.failNextFired = true;

    assert.equal(await harness.step.evaluate(), false);
    const afterCrash = await runFolderIds(harness);
    assert.equal(afterCrash.length, 1);
    assert.deepEqual(await slotLines(harness, schedule.scheduleId), []);
    assert.equal(await cursorOf(harness, schedule.scheduleId), null);
    assert.ok(harness.events.events.some((event) => event.type === 'schedule.evaluate-failed' && event.error === 'SimulatedCrashError'));

    harness.clock.set('2026-11-20T12:31:00.000Z');
    assert.equal(await harness.step.evaluate(), false);

    assert.deepEqual(await runFolderIds(harness), afterCrash);
    const [runId = ''] = afterCrash;
    const lines = await slotLines(harness, schedule.scheduleId);
    assert.deepEqual(
      lines.map((line) => [line.slotAt, line.result, line.runId, line.briefId]),
      [['2026-11-20T12:00:00.000Z', 'fired', runId, schedule.briefs[0]?.briefId]],
    );
    assert.equal(harness.facts.requests.length, 1, 'the guards are not asked again for a slot that already has its run');
    assert.ok(harness.events.events.some((event) => event.type === 'schedule.slot-recovered' && event.runId === runId));
    assert.ok(harness.events.events.some((event) => event.type === 'schedule.evaluate-recovered'));
    assert.equal((await cursorOf(harness, schedule.scheduleId))?.evaluatedThrough, '2026-11-20T12:31:00.000Z');
  });

  it('finds a run written for the slot by a previous process and adds its fired line once', async () => {
    const schedule = addDailySchedule(harness, '2026-11-20T10:00:00.000Z');
    harness.slotLog.failNextFired = true;
    await harness.step.evaluate();
    const [runId = ''] = await runFolderIds(harness);

    // A restarted process: a new step over the same data home, with no in-memory state at all.
    const restartedStep = restartStep(harness);
    harness.clock.set('2026-11-20T12:45:00.000Z');
    await restartedStep.evaluate();
    await restartedStep.evaluate();

    assert.deepEqual(await runFolderIds(harness), [runId]);
    assert.equal((await slotLines(harness, schedule.scheduleId)).filter((line) => line.result === 'fired').length, 1);
    assert.equal((await readRun(harness, runId)).schedule?.slotAt, '2026-11-20T12:00:00.000Z');
  });

  it('appends the fired line, never missed, when the restart comes later than lateGraceMs', async () => {
    const schedule = addDailySchedule(harness, '2026-11-20T10:00:00.000Z');
    harness.slotLog.failNextFired = true;
    await harness.step.evaluate();
    const [runId = ''] = await runFolderIds(harness);

    // Restarted 3 h after the 12:00Z slot: the crashed candidate is now an old slot.
    const restartedStep = restartStep(harness);
    harness.clock.set('2026-11-20T15:00:00.000Z');
    assert.equal(await restartedStep.evaluate(), false);

    assert.deepEqual(await runFolderIds(harness), [runId], 'no second run is written');
    assert.deepEqual(
      (await slotLines(harness, schedule.scheduleId)).map((line) => [line.slotAt, line.result, line.reasonId, line.runId, line.briefId]),
      [['2026-11-20T12:00:00.000Z', 'fired', null, runId, schedule.briefs[0]?.briefId]],
    );
    assert.ok(harness.events.events.some((event) => event.type === 'schedule.slot-recovered' && event.runId === runId));
    assert.equal(harness.facts.requests.length, 1, 'the guards are not asked again for a slot that already has its run');
    assert.equal((await cursorOf(harness, schedule.scheduleId))?.evaluatedThrough, '2026-11-20T15:00:00.000Z');
  });

  it('recovers only the crashed slot across a gap: later old slots stay missed and the newest fires', async () => {
    const schedule = addDailySchedule(harness, '2026-11-20T10:00:00.000Z');
    harness.slotLog.failNextFired = true;
    await harness.step.evaluate();
    const [crashedRunId = ''] = await runFolderIds(harness);

    const restartedStep = restartStep(harness);
    harness.clock.set('2026-11-23T12:30:00.000Z');
    assert.equal(await restartedStep.evaluate(), true);

    const lines = await slotLines(harness, schedule.scheduleId);
    assert.deepEqual(
      lines.map((line) => [line.slotAt, line.result, line.reasonId]),
      [
        ['2026-11-20T12:00:00.000Z', 'fired', null],
        ['2026-11-21T12:00:00.000Z', 'missed', 'watcher-not-running'],
        ['2026-11-22T12:00:00.000Z', 'missed', 'watcher-not-running'],
        ['2026-11-23T12:00:00.000Z', 'fired', null],
      ],
    );
    assert.equal(lines[0]?.runId, crashedRunId);
    const runIds = await runFolderIds(harness);
    assert.equal(runIds.length, 2, 'one run for the crashed slot, one for the newest slot');
    const [newRunId = ''] = runIds.filter((runId) => runId !== crashedRunId);
    assert.equal(lines[3]?.runId, newRunId);
    assert.equal((await readRun(harness, newRunId)).schedule?.slotAt, '2026-11-23T12:00:00.000Z');
  });
});

describe('ScheduleStep.evaluate: paused, deleted and resumed schedules (R3-AC-20)', () => {
  let harness: ScheduleHarness;

  beforeEach(async () => {
    harness = await createHarness('2026-11-20T12:30:00.000Z');
  });

  afterEach(async () => {
    await removeHarness(harness);
  });

  const stoppedStatuses: ReadonlyArray<Exclude<ScheduleFile['status'], 'active'>> = ['paused', 'deleted'];
  for (const status of stoppedStatuses) {
    it(`fires and logs nothing for a ${status} schedule`, async () => {
      const active = addDailySchedule(harness, '2026-11-20T10:00:00.000Z');
      const stopped = withStatus(active, status, '2026-11-20T11:00:00.000Z');
      harness.store.put({ scheduleId: stopped.scheduleId, state: 'readable', file: stopped });

      assert.equal(await harness.step.evaluate(), false);

      assert.deepEqual(await runFolderIds(harness), []);
      assert.deepEqual(await slotLines(harness, stopped.scheduleId), []);
      assert.equal(await cursorOf(harness, stopped.scheduleId), null);
      assert.equal(harness.facts.requests.length, 0);
    });
  }

  it('replays no slot from the paused period after a resume', async () => {
    const active = addDailySchedule(harness, '2026-11-20T10:00:00.000Z');
    await harness.step.evaluate();
    const paused = withStatus(active, 'paused', '2026-11-20T13:00:00.000Z');
    harness.store.put({ scheduleId: paused.scheduleId, state: 'readable', file: paused });
    harness.clock.set('2026-11-22T12:30:00.000Z');
    await harness.step.evaluate();
    const linesWhilePaused = await slotLines(harness, active.scheduleId);

    const resumed = withStatus(paused, 'active', '2026-11-22T13:00:00.000Z');
    harness.store.put({ scheduleId: resumed.scheduleId, state: 'readable', file: resumed });
    harness.clock.set('2026-11-22T13:05:00.000Z');
    assert.equal(await harness.step.evaluate(), false);
    assert.deepEqual(await slotLines(harness, active.scheduleId), linesWhilePaused);

    harness.clock.set('2026-11-23T12:10:00.000Z');
    assert.equal(await harness.step.evaluate(), true);

    const newLines = (await slotLines(harness, active.scheduleId)).slice(linesWhilePaused.length);
    assert.deepEqual(
      newLines.map((line) => [line.slotAt, line.result]),
      [['2026-11-23T12:00:00.000Z', 'fired']],
    );
    assert.equal((await runFolderIds(harness)).length, 2);
  });
});

/*
 * R3 security review L1 (two daemons on one data home must not fire one slot twice) and L2 (a
 * crash after the slot line and before the cursor write must not log the slot again).
 */
describe('ScheduleStep.evaluate: one writer per schedule and no second line for a slot', () => {
  let harness: ScheduleHarness;

  beforeEach(async () => {
    harness = await createHarness('2026-11-20T12:30:00.000Z');
  });

  afterEach(async () => {
    await removeHarness(harness);
  });

  function fireLockPath(scheduleId: string): string {
    return scheduleFilePath({ schedulesRoot: harness.dataHome.schedules, scheduleId }, 'fireLock');
  }

  it('decides nothing while another live process holds fire.lock, then fires once it is released (L1)', async () => {
    const schedule = addDailySchedule(harness, '2026-11-20T10:00:00.000Z');
    // The parent of the test process stands in for a second watcher daemon in mid-evaluation.
    await writeFile(fireLockPath(schedule.scheduleId), `${process.ppid}\n`);

    assert.equal(await harness.step.evaluate(), false);
    assert.equal(await harness.step.evaluate(), false);
    assert.deepEqual(await runFolderIds(harness), []);
    assert.deepEqual(await slotLines(harness, schedule.scheduleId), []);
    assert.equal(await cursorOf(harness, schedule.scheduleId), null);
    assert.equal(harness.facts.requests.length, 0, 'no guard is asked while the other process decides');
    const held = harness.events.events.filter((event) => event.type === 'schedule.fire-lock-held');
    assert.equal(held.length, 1, 'logged once per wait');

    await rm(fireLockPath(schedule.scheduleId));
    assert.equal(await harness.step.evaluate(), true);
    assert.equal((await runFolderIds(harness)).length, 1);
    assert.deepEqual(
      (await slotLines(harness, schedule.scheduleId)).map((line) => line.result),
      ['fired'],
    );
    await assert.rejects(stat(fireLockPath(schedule.scheduleId)), { code: 'ENOENT' }, 'released after the evaluation');
  });

  it('releases fire.lock when the fired append throws, so the recovery can run (L1)', async () => {
    const schedule = addDailySchedule(harness, '2026-11-20T10:00:00.000Z');
    harness.slotLog.failNextFired = true;
    let lockWhileAppending = '';
    harness.slotLog.beforeFired = async () => {
      lockWhileAppending = await readFile(fireLockPath(schedule.scheduleId), 'utf8');
    };

    await harness.step.evaluate();

    assert.equal(lockWhileAppending, `${process.pid}\n`, 'the fired append runs under this process lock');
    await assert.rejects(stat(fireLockPath(schedule.scheduleId)), { code: 'ENOENT' });
  });

  it('does not log a fired slot again when a crash left the cursor behind (L2)', async () => {
    const schedule = addDailySchedule(harness, '2026-11-20T10:00:00.000Z');
    assert.equal(await harness.step.evaluate(), true);
    const runIds = await runFolderIds(harness);

    // The crash: the fired line is in slots.jsonl, the cursor write never happened.
    await rm(scheduleFilePath({ schedulesRoot: harness.dataHome.schedules, scheduleId: schedule.scheduleId }, 'cursor'));
    const restartedStep = restartStep(harness);
    harness.clock.set('2026-11-20T12:40:00.000Z');
    assert.equal(await restartedStep.evaluate(), false);

    assert.deepEqual(await runFolderIds(harness), runIds);
    assert.deepEqual(
      (await slotLines(harness, schedule.scheduleId)).map((line) => [line.slotAt, line.result]),
      [['2026-11-20T12:00:00.000Z', 'fired']],
    );
    assert.equal(harness.events.events.filter((event) => event.type === 'schedule.slot-recovered').length, 0);
    assert.equal((await cursorOf(harness, schedule.scheduleId))?.evaluatedThrough, '2026-11-20T12:40:00.000Z');
  });

  it('still fires when the slots.jsonl tail holds a damaged line, and reports it (re-review L1-new)', async () => {
    const schedule = addDailySchedule(harness, '2026-11-20T10:00:00.000Z');
    const slotsPath = scheduleFilePath({ schedulesRoot: harness.dataHome.schedules, scheduleId: schedule.scheduleId }, 'slots');
    await writeFile(slotsPath, '{"slotAt":"2026-11-19T1{"slotAt":\n');

    assert.equal(await harness.step.evaluate(), true);

    assert.equal((await runFolderIds(harness)).length, 1);
    assert.ok(harness.events.events.some((event) => event.type === 'schedule.slot-log-damaged' && event.unreadableLines === 1));
  });

  it('never fires a slot whose claim exists without a run: logs skipped / internal-error (re-review 2)', async () => {
    const schedule = addDailySchedule(harness, '2026-11-20T10:00:00.000Z');
    const location = { schedulesRoot: harness.dataHome.schedules, scheduleId: schedule.scheduleId };
    // Another process claimed the 12:00 slot and died before writing its run.
    await mkdir(dirname(slotClaimPath(location, slotNoon)), { recursive: true });
    await writeFile(slotClaimPath(location, slotNoon), `${process.ppid}\n`);

    assert.equal(await harness.step.evaluate(), false);
    await harness.step.evaluate();

    assert.deepEqual(await runFolderIds(harness), []);
    assert.deepEqual(
      (await slotLines(harness, schedule.scheduleId)).map((line) => [line.slotAt, line.result, line.reasonId]),
      [['2026-11-20T12:00:00.000Z', 'skipped', 'internal-error']],
    );
    assert.equal(harness.events.events.filter((event) => event.type === 'schedule.slot-claim-taken').length, 1);
    assert.equal(await readFile(slotClaimPath(location, slotNoon), 'utf8'), `${process.ppid}\n`, 'another pid claim is kept');
  });

  it('gives the claim back when the run write fails, so the next evaluation fires the slot once (re-review 2)', async () => {
    const schedule = addDailySchedule(harness, '2026-11-20T10:00:00.000Z');
    const location = { schedulesRoot: harness.dataHome.schedules, scheduleId: schedule.scheduleId };
    const create = harness.runFiles.create.bind(harness.runFiles);
    harness.runFiles.create = async () => {
      throw new SimulatedCrashError();
    };

    assert.equal(await harness.step.evaluate(), false);
    assert.deepEqual(await runFolderIds(harness), []);
    assert.deepEqual(await slotLines(harness, schedule.scheduleId), []);
    await assert.rejects(stat(slotClaimPath(location, slotNoon)), { code: 'ENOENT' }, 'the failed write gave its claim back');

    harness.runFiles.create = create;
    harness.clock.set('2026-11-20T12:31:00.000Z');
    assert.equal(await harness.step.evaluate(), true);

    assert.equal((await runFolderIds(harness)).length, 1);
    assert.deepEqual(
      (await slotLines(harness, schedule.scheduleId)).map((line) => line.result),
      ['fired'],
    );
    assert.equal(await readFile(slotClaimPath(location, slotNoon), 'utf8'), `${process.pid}\n`, 'the fired slot stays claimed');
  });

  it('adds the fired line, never a second run, when another process claimed and wrote the slot meanwhile', async () => {
    const schedule = addDailySchedule(harness, '2026-11-20T10:00:00.000Z');
    assert.equal(await harness.step.evaluate(), true);
    const runIds = await runFolderIds(harness);
    const [runId = ''] = runIds;

    // Another process: its first look for a run ran before the run above was written, so it got
    // as far as the claim. Its slot line and cursor are not there yet.
    const location = { schedulesRoot: harness.dataHome.schedules, scheduleId: schedule.scheduleId };
    await rm(scheduleFilePath(location, 'slots'));
    await rm(scheduleFilePath(location, 'cursor'));
    const reader = new ScheduleRunsReader(harness.dataHome);
    let lookups = 0;
    const racingReader: Pick<ScheduleRunsReader, 'findRunForSlot'> = {
      findRunForSlot: async (slot) => {
        lookups += 1;
        return lookups === 1 ? { state: 'none' } : reader.findRunForSlot(slot);
      },
    };
    harness.clock.set('2026-11-20T12:31:00.000Z');
    assert.equal(await restartStep(harness, racingReader).evaluate(), false);

    assert.deepEqual(await runFolderIds(harness), runIds);
    assert.deepEqual(
      (await slotLines(harness, schedule.scheduleId)).map((line) => [line.result, line.runId]),
      [['fired', runId]],
    );
    assert.equal(harness.events.events.filter((event) => event.type === 'schedule.slot-recovered').length, 1);
    assert.equal(harness.events.events.filter((event) => event.type === 'schedule.slot-claim-taken').length, 0);
  });

  it('does not log missed slots again when a crash left the cursor behind (L2)', async () => {
    const schedule = addDailySchedule(harness, '2026-11-20T10:00:00.000Z');
    harness.clock.set('2026-11-23T12:30:00.000Z');
    await harness.step.evaluate();
    const before = await slotLines(harness, schedule.scheduleId);
    assert.ok(before.some((line) => line.result === 'missed'));

    await rm(scheduleFilePath({ schedulesRoot: harness.dataHome.schedules, scheduleId: schedule.scheduleId }, 'cursor'));
    harness.clock.set('2026-11-23T12:35:00.000Z');
    await restartStep(harness).evaluate();

    assert.deepEqual(await slotLines(harness, schedule.scheduleId), before);
  });
});
