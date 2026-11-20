import { Inject, Injectable } from '@nestjs/common';
import { type Clock } from '../engine/clock';
import { CLOCK } from '../engine/engine.tokens';

/** One stretch during which this process was executing a run or a curation. */
export interface BusyInterval {
  startedAtMs: number;
  endedAtMs: number;
}

/**
 * Intervals kept in memory. One entry per run execution or curation, so a thousand covers far more
 * than the 400 slots one evaluation can look back over; older entries are dropped first.
 */
export const MAX_BUSY_INTERVALS = 1000;

/**
 * This process's record of when it was busy (SPEC 0006 section 5.6 "old slots", B15). The daemon
 * loop wraps each run execution and each curation that ran; the schedule step asks whether a missed
 * slot's instant fell inside one (`watcher-busy`) or not (`watcher-not-running`). It is best effort
 * by design: a restarted process starts with an empty record, because sleep, power off and a
 * stopped agent look the same from inside.
 */
@Injectable()
export class BusyIntervalTracker {
  private readonly intervals: BusyInterval[] = [];

  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  /**
   * Runs `work` and records its interval with the injected clock. `keep` decides from the result
   * whether the work counted as busy (a curation step that found nothing to claim did not).
   */
  async track<T>(work: () => Promise<T>, keep: (result: T) => boolean = () => true): Promise<T> {
    const startedAtMs = this.clock.now().getTime();
    let result: T;
    try {
      result = await work();
    } catch (error) {
      this.record({ startedAtMs, endedAtMs: this.clock.now().getTime() });
      throw error;
    }
    if (keep(result)) this.record({ startedAtMs, endedAtMs: this.clock.now().getTime() });
    return result;
  }

  record(interval: BusyInterval): void {
    if (interval.endedAtMs < interval.startedAtMs) return;
    this.intervals.push(interval);
    if (this.intervals.length > MAX_BUSY_INTERVALS) this.intervals.shift();
  }

  /** True when `instant` falls inside a recorded interval, both ends included. */
  wasBusyAt(instant: Date): boolean {
    const instantMs = instant.getTime();
    return this.intervals.some((interval) => interval.startedAtMs <= instantMs && instantMs <= interval.endedAtMs);
  }
}
