import { type RunId } from '@studio/shared/run-format';
import { scheduleBounds, type SlotLine } from '@studio/shared/schedules';

/** The window of the "Perdidas (7 dias)" count (SPEC 0006 section 5.7). */
export const MISSED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * What the api view and the watcher guards need from one `slots.jsonl`, folded in one pass so the
 * log is read in bounded pages and never held whole.
 */
export interface SlotLogSummary {
  /** Newest first, at most `scheduleBounds.slotsShown`. */
  recent: SlotLine[];
  missedLast7Days: number;
  /** Every `briefId` a `fired` line names: a used brief is never fired again in queue mode. */
  usedBriefIds: ReadonlySet<string>;
  /** `runId` of every `fired` line, oldest first; the last one is the schedule's last fired run. */
  firedRunIds: RunId[];
  lines: number;
}

/**
 * Pure accumulator over slot lines in file order. `now` fixes the 7-day window, so one summary
 * answers for one instant.
 */
export class SlotLogAccumulator {
  private readonly recentOldestFirst: SlotLine[] = [];
  private readonly usedBriefIds = new Set<string>();
  private readonly firedRunIds: RunId[] = [];
  private missedLast7Days = 0;
  private lines = 0;
  private readonly missedSinceMs: number;
  private readonly nowMs: number;

  constructor(now: Date) {
    this.nowMs = now.getTime();
    this.missedSinceMs = this.nowMs - MISSED_WINDOW_MS;
  }

  add(line: SlotLine): void {
    this.lines += 1;
    this.recentOldestFirst.push(line);
    if (this.recentOldestFirst.length > scheduleBounds.slotsShown) this.recentOldestFirst.shift();
    if (line.result === 'missed') {
      const slotMs = Date.parse(line.slotAt);
      if (slotMs >= this.missedSinceMs && slotMs <= this.nowMs) this.missedLast7Days += 1;
    }
    if (line.result === 'fired') {
      if (line.briefId !== null) this.usedBriefIds.add(line.briefId);
      if (line.runId !== null) this.firedRunIds.push(line.runId);
    }
  }

  result(): SlotLogSummary {
    return {
      recent: [...this.recentOldestFirst].reverse(),
      missedLast7Days: this.missedLast7Days,
      usedBriefIds: new Set(this.usedBriefIds),
      firedRunIds: [...this.firedRunIds],
      lines: this.lines,
    };
  }
}

/** A schedule the watcher has not evaluated yet: no slot line exists. */
export function emptySlotLogSummary(): SlotLogSummary {
  return { recent: [], missedLast7Days: 0, usedBriefIds: new Set(), firedRunIds: [], lines: 0 };
}
