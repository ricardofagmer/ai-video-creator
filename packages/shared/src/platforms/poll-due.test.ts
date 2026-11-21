import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PollDateInvalidError, pollDue } from './poll-due';

/*
 * The OD3 cadence (SPEC 0007 section 5.5 step 2, AC 53): daily through day 30, weekly through day
 * 180, then stopped. Dates are local calendar days; the arithmetic below stays in UTC so the test
 * never depends on the machine's time zone.
 */

const PUBLISHED_ON = '2026-01-01';

function dayOf(index: number): string {
  const [year, month, day] = PUBLISHED_ON.split('-').map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + index)).toISOString().slice(0, 10);
}

describe('pollDue — AC 53 fixtures', () => {
  it('is due on day 0 when the publication was never polled', () => {
    assert.deepEqual(pollDue(PUBLISHED_ON, null, dayOf(0)), { status: 'due', dayIndex: 0 });
  });

  it('is due on day 1 after a poll on day 0', () => {
    assert.deepEqual(pollDue(PUBLISHED_ON, dayOf(0), dayOf(1)), { status: 'due', dayIndex: 1 });
  });

  it('is due on day 30, the last day of the daily window', () => {
    assert.deepEqual(pollDue(PUBLISHED_ON, dayOf(29), dayOf(30)), { status: 'due', dayIndex: 30 });
  });

  it('is not due on day 31 after a poll on day 30 and names day 37 as the next poll', () => {
    assert.deepEqual(pollDue(PUBLISHED_ON, dayOf(30), dayOf(31)), {
      status: 'not-due',
      dayIndex: 31,
      nextPollOn: dayOf(37),
    });
  });

  it('is due on day 37, seven days after the last daily poll', () => {
    assert.deepEqual(pollDue(PUBLISHED_ON, dayOf(30), dayOf(37)), { status: 'due', dayIndex: 37 });
  });

  it('is not due on day 38 after a poll on day 37', () => {
    assert.deepEqual(pollDue(PUBLISHED_ON, dayOf(37), dayOf(38)), {
      status: 'not-due',
      dayIndex: 38,
      nextPollOn: dayOf(44),
    });
  });

  it('is due on day 180, the last day of the window', () => {
    assert.deepEqual(pollDue(PUBLISHED_ON, dayOf(173), dayOf(180)), { status: 'due', dayIndex: 180 });
  });

  it('stops on day 181 with window-closed, even when never polled', () => {
    assert.deepEqual(pollDue(PUBLISHED_ON, dayOf(173), dayOf(181)), {
      status: 'stopped',
      dayIndex: 181,
      reason: 'window-closed',
    });
    assert.deepEqual(pollDue(PUBLISHED_ON, null, dayOf(181)), {
      status: 'stopped',
      dayIndex: 181,
      reason: 'window-closed',
    });
  });
});

describe('pollDue — missed days and one poll per day', () => {
  it('a 5-day gap inside the daily window gives one poll, not five', () => {
    assert.deepEqual(pollDue(PUBLISHED_ON, dayOf(3), dayOf(8)), { status: 'due', dayIndex: 8 });
    assert.deepEqual(pollDue(PUBLISHED_ON, dayOf(8), dayOf(8)), {
      status: 'not-due',
      dayIndex: 8,
      nextPollOn: dayOf(9),
    });
  });

  it('never makes one publication due twice on one local day across the whole window', () => {
    let lastPolledOn: string | null = null;
    const polledDays: number[] = [];
    for (let index = 0; index <= 200; index += 1) {
      // Three passes per day stand in for a watcher waking up several times on one day.
      for (let pass = 0; pass < 3; pass += 1) {
        if (pollDue(PUBLISHED_ON, lastPolledOn, dayOf(index)).status === 'due') {
          polledDays.push(index);
          lastPolledOn = dayOf(index);
        }
      }
    }
    assert.equal(new Set(polledDays).size, polledDays.length);
    const daily = Array.from({ length: 31 }, (_, index) => index);
    const weekly = Array.from({ length: 21 }, (_, index) => 37 + index * 7);
    assert.deepEqual(polledDays, [...daily, ...weekly]);
  });
});

describe('pollDue — window edges', () => {
  it('is not due before the publication day and names the publication day as the next poll', () => {
    assert.deepEqual(pollDue(PUBLISHED_ON, null, '2025-12-30'), {
      status: 'not-due',
      dayIndex: -2,
      nextPollOn: PUBLISHED_ON,
    });
  });

  it('answers a null next poll when day 180 passes before the next weekly poll', () => {
    assert.deepEqual(pollDue(PUBLISHED_ON, dayOf(175), dayOf(178)), {
      status: 'not-due',
      dayIndex: 178,
      nextPollOn: null,
    });
  });

  it('enters the weekly window on day 31 when the last poll was long before', () => {
    assert.deepEqual(pollDue(PUBLISHED_ON, dayOf(20), dayOf(31)), { status: 'due', dayIndex: 31 });
  });
});

describe('pollDue — invalid dates', () => {
  it('refuses a calendar-invalid publication day', () => {
    assert.throws(
      () => pollDue('2026-02-30', null, '2026-03-05'),
      (error: unknown) => error instanceof PollDateInvalidError && error.field === 'publishedOn',
    );
  });

  it('refuses a malformed today', () => {
    assert.throws(
      () => pollDue(PUBLISHED_ON, null, '2026-1-05'),
      (error: unknown) => error instanceof PollDateInvalidError && error.field === 'today',
    );
  });

  it('refuses a malformed last poll day', () => {
    assert.throws(
      () => pollDue(PUBLISHED_ON, 'yesterday', dayOf(3)),
      (error: unknown) => error instanceof PollDateInvalidError && error.field === 'lastPolledOn',
    );
  });
});
