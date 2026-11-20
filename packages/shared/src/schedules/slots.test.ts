import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scheduleBounds } from './constants';
import { type Recurrence } from './recurrence';
import { dueSlots, nextSlots } from './slots';

/*
 * SPEC 0006 sections 5.5 and 5.6, R3-AC-21. America/New_York in 2026: DST starts Sunday 8 March
 * (02:00 -> 03:00, UTC-5 -> UTC-4) and ends Sunday 1 November (02:00 -> 01:00, UTC-4 -> UTC-5);
 * in 2027 it starts Sunday 14 March. America/Sao_Paulo has kept UTC-3 all year since 2019.
 */

const newYork = 'America/New_York';
const saoPaulo = 'America/Sao_Paulo';

function isoList(slots: readonly Date[]): string[] {
  return slots.map((slot) => slot.toISOString());
}

function next(recurrence: Recurrence, timezone: string, after: string, count: number): string[] {
  return isoList(nextSlots({ recurrence, timezone, after: new Date(after), count }));
}

describe('nextSlots', () => {
  it('weekly in America/New_York keeps 09:00 local across the fall-back DST change', () => {
    assert.deepEqual(next({ kind: 'weekly', weekdays: [1], time: '09:00' }, newYork, '2026-10-20T00:00:00.000Z', 3), [
      '2026-10-26T13:00:00.000Z',
      '2026-11-02T14:00:00.000Z',
      '2026-11-09T14:00:00.000Z',
    ]);
  });

  it('weekly in America/New_York keeps 09:00 local across the spring-forward DST change', () => {
    assert.deepEqual(next({ kind: 'weekly', weekdays: [1], time: '09:00' }, newYork, '2026-03-01T00:00:00.000Z', 3), [
      '2026-03-02T14:00:00.000Z',
      '2026-03-09T13:00:00.000Z',
      '2026-03-16T13:00:00.000Z',
    ]);
  });

  it('moves a local time inside the spring-forward gap to the first valid minute after it', () => {
    assert.deepEqual(next({ kind: 'weekly', weekdays: [7], time: '02:30' }, newYork, '2026-03-01T12:00:00.000Z', 2), [
      '2026-03-08T07:00:00.000Z',
      '2026-03-15T06:30:00.000Z',
    ]);
  });

  it('uses the first occurrence of a local time that happens twice at fall-back', () => {
    assert.deepEqual(next({ kind: 'weekly', weekdays: [7], time: '01:30' }, newYork, '2026-10-30T00:00:00.000Z', 2), [
      '2026-11-01T05:30:00.000Z',
      '2026-11-08T06:30:00.000Z',
    ]);
  });

  it('weekly with several weekdays lists them in time order', () => {
    assert.deepEqual(next({ kind: 'weekly', weekdays: [5, 2], time: '18:15' }, saoPaulo, '2026-11-19T00:00:00.000Z', 3), [
      '2026-11-20T21:15:00.000Z',
      '2026-11-24T21:15:00.000Z',
      '2026-11-27T21:15:00.000Z',
    ]);
  });

  it('monthly on day 28 hits February and follows the 2027 DST start', () => {
    assert.deepEqual(next({ kind: 'monthly', dayOfMonth: 28, time: '10:00' }, newYork, '2027-01-15T00:00:00.000Z', 3), [
      '2027-01-28T15:00:00.000Z',
      '2027-02-28T15:00:00.000Z',
      '2027-03-28T14:00:00.000Z',
    ]);
  });

  it('once yields its single slot, then nothing once it has passed', () => {
    const once: Recurrence = { kind: 'once', date: '2026-12-01', time: '08:00' };
    assert.deepEqual(next(once, saoPaulo, '2026-11-19T00:00:00.000Z', 5), ['2026-12-01T11:00:00.000Z']);
    assert.deepEqual(next(once, saoPaulo, '2026-12-01T10:59:00.000Z', 5), ['2026-12-01T11:00:00.000Z']);
    assert.deepEqual(next(once, saoPaulo, '2026-12-01T11:00:00.000Z', 5), []);
    assert.deepEqual(next(once, saoPaulo, '2027-01-01T00:00:00.000Z', 5), []);
  });

  it('daily in America/Sao_Paulo is 3 hours behind UTC and excludes a slot equal to after', () => {
    assert.deepEqual(next({ kind: 'daily', time: '09:00' }, saoPaulo, '2026-11-19T12:00:00.000Z', 3), [
      '2026-11-20T12:00:00.000Z',
      '2026-11-21T12:00:00.000Z',
      '2026-11-22T12:00:00.000Z',
    ]);
  });

  it('America/Sao_Paulo has no gap at the former first-Sunday-of-November DST start', () => {
    assert.deepEqual(next({ kind: 'weekly', weekdays: [7], time: '00:00' }, saoPaulo, '2026-10-30T00:00:00.000Z', 2), [
      '2026-11-01T03:00:00.000Z',
      '2026-11-08T03:00:00.000Z',
    ]);
  });

  it('returns nothing for a count of 0', () => {
    assert.deepEqual(next({ kind: 'daily', time: '09:00' }, saoPaulo, '2026-11-19T00:00:00.000Z', 0), []);
  });
});

describe('dueSlots', () => {
  it('lists the slots in (from, now]: from excluded, now included, across a DST change', () => {
    const due = dueSlots(
      { recurrence: { kind: 'weekly', weekdays: [1], time: '09:00' }, timezone: newYork },
      new Date('2026-10-26T13:00:00.000Z'),
      new Date('2026-11-09T14:00:00.000Z'),
    );
    assert.deepEqual(isoList(due), ['2026-11-02T14:00:00.000Z', '2026-11-09T14:00:00.000Z']);
  });

  it('lists daily slots across the fall-back weekend in America/New_York', () => {
    const due = dueSlots(
      { recurrence: { kind: 'daily', time: '09:00' }, timezone: newYork },
      new Date('2026-10-31T00:00:00.000Z'),
      new Date('2026-11-03T00:00:00.000Z'),
    );
    assert.deepEqual(isoList(due), ['2026-10-31T13:00:00.000Z', '2026-11-01T14:00:00.000Z', '2026-11-02T14:00:00.000Z']);
  });

  it('is empty when no slot falls in the window', () => {
    const due = dueSlots(
      { recurrence: { kind: 'monthly', dayOfMonth: 28, time: '10:00' }, timezone: saoPaulo },
      new Date('2026-11-01T00:00:00.000Z'),
      new Date('2026-11-27T23:59:00.000Z'),
    );
    assert.deepEqual(due, []);
  });

  it('lists a once slot inside the window', () => {
    const due = dueSlots(
      { recurrence: { kind: 'once', date: '2026-12-01', time: '08:00' }, timezone: saoPaulo },
      new Date('2026-11-30T00:00:00.000Z'),
      new Date('2026-12-02T00:00:00.000Z'),
    );
    assert.deepEqual(isoList(due), ['2026-12-01T11:00:00.000Z']);
  });

  it('keeps at most 400 slots, the newest ones', () => {
    const due = dueSlots(
      { recurrence: { kind: 'daily', time: '09:00' }, timezone: saoPaulo },
      new Date('2025-01-01T00:00:00.000Z'),
      new Date('2026-06-01T00:00:00.000Z'),
    );
    assert.equal(scheduleBounds.maxSlotsPerEvaluation, 400);
    assert.equal(due.length, 400);
    assert.equal(due[due.length - 1]?.toISOString(), '2026-05-31T12:00:00.000Z');
    assert.equal(due[0]?.toISOString(), '2025-04-27T12:00:00.000Z');
  });
});
