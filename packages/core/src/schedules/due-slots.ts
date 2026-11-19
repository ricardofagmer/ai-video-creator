import { dueSlots, scheduleBounds, type ScheduleCursor, type ScheduleFile } from '@studio/shared/schedules';

/*
 * The window, old-slot and candidate rows of SPEC 0006 section 5.6, pure. Which missed reason an
 * old slot gets (`watcher-busy` or `watcher-not-running`) needs the watcher's own busy record, so
 * the watcher (R3-04) assigns it.
 */

/** Due slots of one evaluation: at most one candidate; every other due slot is `missed`. */
export interface DueSlotSplit {
  /** Oldest first: every slot older than `lateGraceMs`, and every in-grace slot but the newest. */
  missed: Date[];
  /** The newest slot within `lateGraceMs`, or null; one evaluation never fires two runs. */
  candidate: Date | null;
}

/**
 * `from = max(cursor.evaluatedThrough, schedule.statusSince)`: a schedule seen for the first time
 * uses `statusSince`, so nothing before creation or resume is ever due (R3-AC-20).
 */
export function evaluationWindowStart(schedule: Pick<ScheduleFile, 'statusSince'>, cursor: Pick<ScheduleCursor, 'evaluatedThrough'> | null): Date {
  const sinceMs = Date.parse(schedule.statusSince);
  const throughMs = cursor === null ? Number.NEGATIVE_INFINITY : Date.parse(cursor.evaluatedThrough);
  return new Date(Math.max(sinceMs, throughMs));
}

/** Splits the due slots of `(from, now]` into missed slots and the one fire candidate. */
export function splitDueSlots(due: readonly Date[], now: Date): DueSlotSplit {
  const graceStartMs = now.getTime() - scheduleBounds.lateGraceMs;
  const inGrace = due.filter((slot) => slot.getTime() >= graceStartMs);
  const candidate = inGrace.length > 0 ? (inGrace[inGrace.length - 1] ?? null) : null;
  return { missed: due.filter((slot) => slot !== candidate), candidate };
}

/**
 * The due slots of an `active` schedule at `now`; a paused or deleted schedule has none (R3-AC-20).
 * At most `scheduleBounds.maxSlotsPerEvaluation`, the newest kept (`dueSlots`).
 */
export function dueSlotSplit(schedule: ScheduleFile, cursor: ScheduleCursor | null, now: Date): DueSlotSplit {
  if (schedule.status !== 'active') return { missed: [], candidate: null };
  const from = evaluationWindowStart(schedule, cursor);
  return splitDueSlots(dueSlots(schedule, from, now), now);
}
