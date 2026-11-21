import { type IsoDate } from '../common/ids';
import { pollRules } from './constants';

/*
 * The OD3 cadence as one pure function (SPEC 0007 section 5.5 step 2). Dates are local calendar
 * days `YYYY-MM-DD`; the caller converts instants to the local day before calling, so this file
 * reads no clock and no time zone. Browser-safe.
 */

const DAY_MS = 86_400_000;
const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A date argument that is not a real calendar day `YYYY-MM-DD`. */
export class PollDateInvalidError extends Error {
  constructor(readonly field: 'publishedOn' | 'lastPolledOn' | 'today') {
    super(`pollDue: ${field} is not a calendar date YYYY-MM-DD`);
    this.name = 'PollDateInvalidError';
  }
}

/**
 * `due`: poll today. `not-due`: wait; `nextPollOn` is the next due day, or null when the window
 * closes first. `stopped`: past day 180, never polled again. `dayIndex` is today minus the
 * publication day, in local days.
 */
export type PollDecision =
  | { status: 'due'; dayIndex: number }
  | { status: 'not-due'; dayIndex: number; nextPollOn: IsoDate | null }
  | { status: 'stopped'; dayIndex: number; reason: 'window-closed' };

function dayNumber(value: string, field: PollDateInvalidError['field']): number {
  const match = isoDatePattern.exec(value);
  if (match === null) throw new PollDateInvalidError(field);
  const year = Number.parseInt(match[1] ?? '', 10);
  const month = Number.parseInt(match[2] ?? '', 10);
  const day = Number.parseInt(match[3] ?? '', 10);
  const epochMs = Date.UTC(year, month - 1, day);
  // Date.UTC rolls 2026-02-30 over to March; a day that does not round-trip is not a real date.
  if (new Date(epochMs).toISOString().slice(0, 10) !== value) throw new PollDateInvalidError(field);
  return epochMs / DAY_MS;
}

function isoDateOf(days: number): IsoDate {
  return new Date(days * DAY_MS).toISOString().slice(0, 10);
}

/** The first day after `today` the rule makes due, or null when day 180 passes first. */
function nextDueDay(options: { published: number; lastPolled: number; today: number }): number | null {
  const { published, lastPolled, today } = options;
  const daily = Math.max(today + 1, lastPolled + 1, published);
  if (daily - published <= pollRules.dailyThroughDay) return daily;
  const weekly = Math.max(today + 1, lastPolled + pollRules.weeklyEveryDays, published + pollRules.dailyThroughDay + 1);
  return weekly - published <= pollRules.stopAfterDay ? weekly : null;
}

/**
 * With `d = today - publishedOn`: `d < 0` not due; `0 <= d <= 30` due when `lastPolledOn < today`;
 * `31 <= d <= 180` due when `today - lastPolledOn >= 7`; `d > 180` stopped `window-closed`. A null
 * `lastPolledOn` is due anywhere inside the window. Days missed while the Mac slept are not
 * replayed: counts are cumulative, so one poll covers them, and a publication is never due twice on
 * one local day.
 */
export function pollDue(publishedOn: IsoDate, lastPolledOn: IsoDate | null, today: IsoDate): PollDecision {
  const published = dayNumber(publishedOn, 'publishedOn');
  const current = dayNumber(today, 'today');
  const lastPolled = lastPolledOn === null ? null : dayNumber(lastPolledOn, 'lastPolledOn');
  const dayIndex = current - published;
  if (dayIndex > pollRules.stopAfterDay) return { status: 'stopped', dayIndex, reason: 'window-closed' };
  if (dayIndex < 0) return { status: 'not-due', dayIndex, nextPollOn: publishedOn };
  if (lastPolled === null) return { status: 'due', dayIndex };
  const due =
    dayIndex <= pollRules.dailyThroughDay ? lastPolled < current : current - lastPolled >= pollRules.weeklyEveryDays;
  if (due) return { status: 'due', dayIndex };
  const next = nextDueDay({ published, lastPolled, today: current });
  return { status: 'not-due', dayIndex, nextPollOn: next === null ? null : isoDateOf(next) };
}
