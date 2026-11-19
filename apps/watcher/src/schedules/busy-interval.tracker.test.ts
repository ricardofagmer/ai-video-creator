import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type Clock } from '../engine/clock';
import { BusyIntervalTracker, MAX_BUSY_INTERVALS } from './busy-interval.tracker';

/*
 * The busy record behind `watcher-busy` (SPEC 0006 section 5.6, B15): only work that really ran is
 * recorded, both ends of an interval count, and the record stays bounded.
 */

class SteppingClock implements Clock {
  constructor(private nowMs: number) {}

  now(): Date {
    return new Date(this.nowMs);
  }

  advance(ms: number): void {
    this.nowMs += ms;
  }
}

const start = Date.parse('2026-11-20T11:00:00.000Z');
const minuteMs = 60_000;

describe('BusyIntervalTracker', () => {
  it('records the interval of tracked work with the injected clock and returns its result', async () => {
    const clock = new SteppingClock(start);
    const tracker = new BusyIntervalTracker(clock);

    const result = await tracker.track(async () => {
      clock.advance(30 * minuteMs);
      return 'done';
    });

    assert.equal(result, 'done');
    assert.equal(tracker.wasBusyAt(new Date(start)), true);
    assert.equal(tracker.wasBusyAt(new Date(start + 30 * minuteMs)), true);
    assert.equal(tracker.wasBusyAt(new Date(start + 31 * minuteMs)), false);
    assert.equal(tracker.wasBusyAt(new Date(start - 1)), false);
  });

  it('does not record work that `keep` rejects (a curation step with nothing to claim)', async () => {
    const clock = new SteppingClock(start);
    const tracker = new BusyIntervalTracker(clock);

    await tracker.track(
      async () => {
        clock.advance(minuteMs);
        return false;
      },
      (ran) => ran,
    );

    assert.equal(tracker.wasBusyAt(new Date(start)), false);
  });

  it('records work that throws, then rethrows the same error', async () => {
    const clock = new SteppingClock(start);
    const tracker = new BusyIntervalTracker(clock);
    const failure = new Error('run failed');

    await assert.rejects(
      tracker.track(async () => {
        clock.advance(minuteMs);
        throw failure;
      }),
      (error) => error === failure,
    );

    assert.equal(tracker.wasBusyAt(new Date(start + minuteMs)), true);
  });

  it('keeps at most MAX_BUSY_INTERVALS intervals, dropping the oldest first', () => {
    const tracker = new BusyIntervalTracker(new SteppingClock(start));
    for (let index = 0; index <= MAX_BUSY_INTERVALS; index += 1) {
      const startedAtMs = start + index * 10 * minuteMs;
      tracker.record({ startedAtMs, endedAtMs: startedAtMs + minuteMs });
    }

    assert.equal(tracker.wasBusyAt(new Date(start)), false);
    assert.equal(tracker.wasBusyAt(new Date(start + 10 * minuteMs)), true);
    assert.equal(tracker.wasBusyAt(new Date(start + MAX_BUSY_INTERVALS * 10 * minuteMs)), true);
  });
});
