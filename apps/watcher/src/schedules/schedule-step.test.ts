import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  SCHEDULE_TITLE,
  addDailySchedule,
  createHarness,
  cursorOf,
  readRun,
  removeHarness,
  runFolderEntries,
  runFolderIds,
  slotLines,
  type ScheduleHarness,
} from './schedule-step.harness.test';

/*
 * SPEC 0006 section 5.6 through the real step: R3-AC-12 (the run written is `pending` with its
 * `schedule` link and nothing else in its folder), R3-AC-15 (a 3-day clock gap logs 2 or 3 `missed`
 * lines and fires at most one run), R3-AC-17 (unknown month spend skips) and the K7 rule that no
 * event carries brief text or a title. Every daily slot of the fixture schedule is 12:00Z.
 */

describe('ScheduleStep.evaluate: firing a due slot (R3-AC-12)', () => {
  let harness: ScheduleHarness;

  beforeEach(async () => {
    harness = await createHarness('2026-11-20T12:30:00.000Z');
  });

  afterEach(async () => {
    await removeHarness(harness);
  });

  it('writes one run.json at pending, created by the watcher with the schedule link, and nothing else', async () => {
    const schedule = addDailySchedule(harness, '2026-11-20T10:00:00.000Z');

    assert.equal(await harness.step.evaluate(), true);

    const runIds = await runFolderIds(harness);
    assert.equal(runIds.length, 1);
    const [runId = ''] = runIds;
    assert.deepEqual(await runFolderEntries(harness, runId), ['run.json']);
    const run = await readRun(harness, runId);
    assert.equal(run.state.status, 'pending');
    assert.equal(run.createdBy, 'watcher');
    assert.equal(run.correlationId, null);
    assert.deepEqual(run.schedule, { scheduleId: schedule.scheduleId, slotAt: '2026-11-20T12:00:00.000Z', briefId: schedule.briefs[0]?.briefId });
    assert.equal(run.recipe.ref, schedule.recipeRef);

    const lines = await slotLines(harness, schedule.scheduleId);
    assert.deepEqual(lines, [
      {
        slotAt: '2026-11-20T12:00:00.000Z',
        decidedAt: '2026-11-20T12:30:00.000Z',
        result: 'fired',
        reasonId: null,
        runId,
        briefId: schedule.briefs[0]?.briefId,
      },
    ]);
    assert.equal((await cursorOf(harness, schedule.scheduleId))?.evaluatedThrough, '2026-11-20T12:30:00.000Z');
  });

  it('records a schedule.slot event with ids, result and lateness only (K7)', async () => {
    const schedule = addDailySchedule(harness, '2026-11-20T10:00:00.000Z');
    await harness.step.evaluate();

    const [runId] = await runFolderIds(harness);
    assert.deepEqual(harness.events.events, [
      {
        type: 'schedule.slot',
        scheduleId: schedule.scheduleId,
        slotAt: '2026-11-20T12:00:00.000Z',
        result: 'fired',
        reasonId: null,
        runId,
        latenessMs: 1_800_000,
      },
    ]);
    const logged = JSON.stringify(harness.events.events);
    assert.equal(logged.includes(SCHEDULE_TITLE), false);
    assert.equal(logged.includes(harness.fixtureRun.brief.topic), false);
  });

  it('writes nothing when no slot is due yet', async () => {
    const schedule = addDailySchedule(harness, '2026-11-20T12:10:00.000Z');

    assert.equal(await harness.step.evaluate(), false);

    assert.deepEqual(await runFolderIds(harness), []);
    assert.deepEqual(await slotLines(harness, schedule.scheduleId), []);
    assert.equal(await cursorOf(harness, schedule.scheduleId), null);
  });
});

describe('ScheduleStep.evaluate: a 3-day clock gap (R3-AC-15)', () => {
  let harness: ScheduleHarness;

  beforeEach(async () => {
    harness = await createHarness('2026-11-20T12:30:00.000Z');
  });

  afterEach(async () => {
    await removeHarness(harness);
  });

  it('logs 2 missed lines and fires one run when the newest slot is within the grace', async () => {
    const schedule = addDailySchedule(harness, '2026-11-20T10:00:00.000Z');
    await harness.step.evaluate();
    const before = await runFolderIds(harness);

    harness.clock.set('2026-11-23T12:30:00.000Z');
    assert.equal(await harness.step.evaluate(), true);

    const gapLines = (await slotLines(harness, schedule.scheduleId)).slice(1);
    assert.deepEqual(
      gapLines.map((line) => [line.slotAt, line.result, line.reasonId]),
      [
        ['2026-11-21T12:00:00.000Z', 'missed', 'watcher-not-running'],
        ['2026-11-22T12:00:00.000Z', 'missed', 'watcher-not-running'],
        ['2026-11-23T12:00:00.000Z', 'fired', null],
      ],
    );
    const created = (await runFolderIds(harness)).filter((runId) => !before.includes(runId));
    assert.equal(created.length, 1);
    const [createdRunId = ''] = created;
    assert.equal((await readRun(harness, createdRunId)).schedule?.slotAt, '2026-11-23T12:00:00.000Z');
  });

  it('logs 3 missed lines and fires nothing when every slot is older than the grace', async () => {
    const schedule = addDailySchedule(harness, '2026-11-20T10:00:00.000Z');
    await harness.step.evaluate();
    const before = await runFolderIds(harness);

    harness.clock.set('2026-11-23T15:00:00.000Z');
    assert.equal(await harness.step.evaluate(), false);

    const gapLines = (await slotLines(harness, schedule.scheduleId)).slice(1);
    assert.equal(gapLines.length, 3);
    assert.ok(gapLines.every((line) => line.result === 'missed' && line.reasonId === 'watcher-not-running' && line.runId === null));
    assert.deepEqual(await runFolderIds(harness), before);
    assert.equal((await cursorOf(harness, schedule.scheduleId))?.evaluatedThrough, '2026-11-23T15:00:00.000Z');
  });

  it('never replays a missed slot on a later evaluation', async () => {
    const schedule = addDailySchedule(harness, '2026-11-20T10:00:00.000Z');
    harness.clock.set('2026-11-23T15:00:00.000Z');
    await harness.step.evaluate();
    const linesAfterGap = await slotLines(harness, schedule.scheduleId);

    harness.clock.set('2026-11-23T15:05:00.000Z');
    assert.equal(await harness.step.evaluate(), false);

    assert.deepEqual(await slotLines(harness, schedule.scheduleId), linesAfterGap);
    assert.deepEqual(await runFolderIds(harness), []);
  });
});

describe('ScheduleStep.evaluate: month spend and guard failures (R3-AC-17)', () => {
  let harness: ScheduleHarness;

  beforeEach(async () => {
    harness = await createHarness('2026-11-20T12:30:00.000Z');
  });

  afterEach(async () => {
    await removeHarness(harness);
  });

  it('skips with month-spend-unavailable and creates no run when month-to-date is unknown', async () => {
    const schedule = addDailySchedule(harness, '2026-11-20T10:00:00.000Z');
    harness.facts.facts = { ...harness.facts.facts, monthToDateUsd: null };

    assert.equal(await harness.step.evaluate(), false);

    const lines = await slotLines(harness, schedule.scheduleId);
    assert.deepEqual(
      lines.map((line) => [line.result, line.reasonId, line.runId]),
      [['skipped', 'month-spend-unavailable', null]],
    );
    assert.deepEqual(await runFolderIds(harness), []);
  });

  it('skips with over-month-ceiling at or over the recipe month ceiling', async () => {
    const schedule = addDailySchedule(harness, '2026-11-20T10:00:00.000Z');
    harness.facts.facts = { ...harness.facts.facts, monthToDateUsd: 60 };

    assert.equal(await harness.step.evaluate(), false);

    assert.deepEqual(
      (await slotLines(harness, schedule.scheduleId)).map((line) => line.reasonId),
      ['over-month-ceiling'],
    );
    assert.deepEqual(await runFolderIds(harness), []);
  });

  it('skips with internal-error when the guard facts cannot be read', async () => {
    const schedule = addDailySchedule(harness, '2026-11-20T10:00:00.000Z');
    harness.facts.failure = new Error('facts unavailable');

    assert.equal(await harness.step.evaluate(), false);

    assert.deepEqual(
      (await slotLines(harness, schedule.scheduleId)).map((line) => [line.result, line.reasonId]),
      [['skipped', 'internal-error']],
    );
    assert.deepEqual(await runFolderIds(harness), []);
    assert.ok(harness.events.events.some((event) => event.type === 'schedule.evaluate-failed' && event.error === 'Error'));
  });

  it('skips an unreadable schedule.json without writing anything, reporting it once per outage', async () => {
    const schedule = addDailySchedule(harness, '2026-11-20T10:00:00.000Z');
    harness.store.put({ scheduleId: schedule.scheduleId, state: 'unreadable' });

    await harness.step.evaluate();
    await harness.step.evaluate();

    assert.deepEqual(await slotLines(harness, schedule.scheduleId), []);
    assert.deepEqual(await runFolderIds(harness), []);
    assert.deepEqual(harness.events.events, [{ type: 'schedule.unreadable', scheduleId: schedule.scheduleId, reasonId: 'schedule-unreadable' }]);
  });
});
