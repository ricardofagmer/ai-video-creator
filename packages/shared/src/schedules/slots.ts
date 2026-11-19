import { scheduleBounds } from './constants';
import { type Recurrence } from './recurrence';
import { addLocalDays, compareLocalDates, isoWeekday, localDateOf, zonedInstant, type LocalDate } from './zoned-time';

/*
 * Slot computation (SPEC 0006 sections 5.5 and 5.6). One pure definition, used by the api (the
 * next five slots) and by the watcher (due slots), so both always agree. Browser-safe.
 */

/**
 * A valid recurrence matches within 31 local days; two months without a match means the input
 * bypassed `RecurrenceSchema`, and the generator stops instead of looping forever.
 */
const MAX_DAYS_WITHOUT_SLOT = 62;

/** What a recurrence needs to place its slots. */
export interface SlotSchedule {
  recurrence: Recurrence;
  /** IANA zone, already validated by `IanaTimeZoneSchema`. */
  timezone: string;
}

function parseLocalDate(isoDate: string): LocalDate {
  const [year = 0, month = 1, day = 1] = isoDate.split('-').map((part) => Number.parseInt(part, 10));
  return { year, month, day };
}

function parseLocalTime(time: string): { hour: number; minute: number } {
  const [hour = 0, minute = 0] = time.split(':').map((part) => Number.parseInt(part, 10));
  return { hour, minute };
}

function matchesDay(recurrence: Recurrence, date: LocalDate): boolean {
  switch (recurrence.kind) {
    case 'once':
      return compareLocalDates(date, parseLocalDate(recurrence.date)) === 0;
    case 'daily':
      return true;
    case 'weekly':
      return recurrence.weekdays.includes(isoWeekday(date));
    case 'monthly':
      return date.day === recurrence.dayOfMonth;
  }
}

/**
 * Slot instants strictly after `afterMs`, ascending, forever (a `once` recurrence yields at most
 * one). It starts one local day before the local date of `afterMs` so a slot moved forward by a
 * DST gap is never skipped. Every valid non-`once` recurrence matches within 31 days, so each step
 * of a consumer advances at most 31 local days.
 */
function* slotsAfter(schedule: SlotSchedule, afterMs: number): Generator<number, void, undefined> {
  const { recurrence, timezone } = schedule;
  const time = parseLocalTime(recurrence.time);
  let date = addLocalDays(localDateOf(timezone, afterMs), -1);
  if (recurrence.kind === 'once') {
    const onceDate = parseLocalDate(recurrence.date);
    if (compareLocalDates(onceDate, date) < 0) return;
    const instant = zonedInstant(timezone, { date: onceDate, ...time });
    if (instant > afterMs) yield instant;
    return;
  }
  let daysWithoutSlot = 0;
  while (daysWithoutSlot <= MAX_DAYS_WITHOUT_SLOT) {
    daysWithoutSlot += 1;
    if (matchesDay(recurrence, date)) {
      daysWithoutSlot = 0;
      const instant = zonedInstant(timezone, { date, ...time });
      if (instant > afterMs) yield instant;
    }
    date = addLocalDays(date, 1);
  }
}

/**
 * `nextSlots` (section 5.5): the first `count` slot instants strictly after `after`, ascending.
 * Fewer only for a `once` recurrence. Local times that do not exist move to the first valid minute
 * after them; local times that happen twice use the first occurrence.
 */
export function nextSlots(options: SlotSchedule & { after: Date; count: number }): Date[] {
  const slots: Date[] = [];
  if (options.count <= 0) return slots;
  for (const instant of slotsAfter(options, options.after.getTime())) {
    slots.push(new Date(instant));
    if (slots.length >= options.count) break;
  }
  return slots;
}

/**
 * `dueSlots` (section 5.6): the slots in `(from, now]`, ascending, at most
 * `scheduleBounds.maxSlotsPerEvaluation`. When more fall in the window, the newest are kept: the
 * newest slot is the only fire candidate, and the older ones would all be `missed` anyway.
 */
export function dueSlots(schedule: SlotSchedule, from: Date, now: Date): Date[] {
  const nowMs = now.getTime();
  const due: number[] = [];
  for (const instant of slotsAfter(schedule, from.getTime())) {
    if (instant > nowMs) break;
    due.push(instant);
    if (due.length > scheduleBounds.maxSlotsPerEvaluation) due.shift();
  }
  return due.map((instant) => new Date(instant));
}
