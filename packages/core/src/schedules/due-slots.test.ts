import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dueSlots, type SlotSchedule } from '@studio/shared/schedules';
import { evaluationWindowStart, splitDueSlots } from './due-slots';

/*
 * The window, old-slot and candidate rows of SPEC 0006 section 5.6 over `dueSlots`: one evaluation
 * fires at most one slot, the newest within `lateGraceMs` (2 h); every other due slot is missed.
 */

const hourMs = 3_600_000;

describe('evaluationWindowStart', () => {
  it('uses statusSince for a schedule seen for the first time', () => {
    assert.equal(evaluationWindowStart({ statusSince: '2026-11-19T10:00:00.000Z' }, null).toISOString(), '2026-11-19T10:00:00.000Z');
  });

  it('uses the later of the cursor and statusSince, so nothing before a resume is due', () => {
    const resumedLater = evaluationWindowStart({ statusSince: '2026-11-19T10:00:00.000Z' }, { evaluatedThrough: '2026-11-18T10:00:00.000Z' });
    assert.equal(resumedLater.toISOString(), '2026-11-19T10:00:00.000Z');
    const cursorLater = evaluationWindowStart({ statusSince: '2026-11-01T00:00:00.000Z' }, { evaluatedThrough: '2026-11-18T10:00:00.000Z' });
    assert.equal(cursorLater.toISOString(), '2026-11-18T10:00:00.000Z');
  });
});

describe('splitDueSlots', () => {
  const now = new Date('2026-11-19T12:00:00.000Z');

  it('has no candidate and nothing missed with no due slot', () => {
    assert.deepEqual(splitDueSlots([], now), { missed: [], candidate: null });
  });

  it('makes the newest slot within the grace the only candidate', () => {
    const old = new Date(now.getTime() - 3 * hourMs);
    const inGraceOlder = new Date(now.getTime() - 90 * 60_000);
    const inGraceNewest = new Date(now.getTime() - 10 * 60_000);
    const split = splitDueSlots([old, inGraceOlder, inGraceNewest], now);
    assert.equal(split.candidate, inGraceNewest);
    assert.deepEqual(split.missed, [old, inGraceOlder]);
  });

  it('counts a slot exactly 2 h late as within the grace, and one minute more as missed', () => {
    const atGrace = new Date(now.getTime() - 2 * hourMs);
    assert.equal(splitDueSlots([atGrace], now).candidate, atGrace);
    const pastGrace = new Date(now.getTime() - 2 * hourMs - 60_000);
    assert.deepEqual(splitDueSlots([pastGrace], now), { missed: [pastGrace], candidate: null });
  });

  it('after a 3-day gap a daily schedule misses the old slots and fires at most one', () => {
    const schedule: SlotSchedule = { recurrence: { kind: 'daily', time: '09:00' }, timezone: 'America/Sao_Paulo' };
    const from = new Date('2026-11-16T12:30:00.000Z');
    const nowAfterGap = new Date('2026-11-19T12:30:00.000Z');
    const split = splitDueSlots(dueSlots(schedule, from, nowAfterGap), nowAfterGap);
    assert.equal(split.candidate?.toISOString(), '2026-11-19T12:00:00.000Z');
    assert.deepEqual(
      split.missed.map((slot) => slot.toISOString()),
      ['2026-11-17T12:00:00.000Z', '2026-11-18T12:00:00.000Z'],
    );
  });
});
