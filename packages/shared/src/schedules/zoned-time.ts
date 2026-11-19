/*
 * Local wall-clock time to instant in an IANA zone, with `Intl.DateTimeFormat` only (K9: no
 * dependency). Pure apart from a formatter cache; browser-safe. Wall times are handled as
 * "wall milliseconds": the local date and time read as if they were UTC.
 */

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** A local calendar date. `month` is 1-12. */
export interface LocalDate {
  year: number;
  month: number;
  day: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** The zone's wall clock at `instantMs`, as wall milliseconds (seconds kept, milliseconds dropped). */
function wallAt(timeZone: string, instantMs: number): number {
  const fields: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};
  for (const part of formatterFor(timeZone).formatToParts(new Date(instantMs))) {
    if (part.type !== 'literal') fields[part.type] = Number.parseInt(part.value, 10);
  }
  const { year = 0, month = 1, day = 1, hour = 0, minute = 0, second = 0 } = fields;
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

/** Wall minus instant at `instantMs`: the zone's UTC offset then, in milliseconds. */
function offsetAt(timeZone: string, instantMs: number): number {
  return wallAt(timeZone, instantMs) - Math.floor(instantMs / 1000) * 1000;
}

/** The local calendar date of an instant in the zone. */
export function localDateOf(timeZone: string, instantMs: number): LocalDate {
  const wall = new Date(wallAt(timeZone, instantMs));
  return { year: wall.getUTCFullYear(), month: wall.getUTCMonth() + 1, day: wall.getUTCDate() };
}

/** The local date `days` after `date` (calendar arithmetic, no zone involved). */
export function addLocalDays(date: LocalDate, days: number): LocalDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

/** ISO weekday of a local date: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(date: LocalDate): number {
  return ((new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay() + 6) % 7) + 1;
}

/** Orders two local dates; negative when `left` is earlier. */
export function compareLocalDates(left: LocalDate, right: LocalDate): number {
  return Date.UTC(left.year, left.month - 1, left.day) - Date.UTC(right.year, right.month - 1, right.day);
}

/**
 * The first instant of the gap's end: the smallest minute in `[low, high]` whose offset is already
 * `laterOffset`. A gap is at most a few hours wide, so this is a handful of formatter calls.
 */
function transitionInstant(timeZone: string, range: { low: number; high: number; laterOffset: number }): number {
  let low = Math.floor(range.low / MINUTE_MS);
  let high = Math.ceil(range.high / MINUTE_MS);
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (offsetAt(timeZone, middle * MINUTE_MS) === range.laterOffset) high = middle;
    else low = middle + 1;
  }
  return low * MINUTE_MS;
}

/**
 * The instant of local `date` at `hour:minute` in the zone (SPEC 0006 section 5.5). A local time
 * that happens twice (fall back) uses the first occurrence; a local time that does not exist
 * (spring forward) moves to the first valid minute after it, which is the transition instant.
 */
export function zonedInstant(timeZone: string, local: { date: LocalDate; hour: number; minute: number }): number {
  const wall = Date.UTC(local.date.year, local.date.month - 1, local.date.day, local.hour, local.minute);
  const offsetBefore = offsetAt(timeZone, wall - DAY_MS);
  const offsetAfter = offsetAt(timeZone, wall + DAY_MS);
  const candidates = [wall - offsetBefore, wall - offsetAfter].filter(
    (instant) => instant + offsetAt(timeZone, instant) === wall,
  );
  if (candidates.length > 0) return Math.min(...candidates);
  // In a gap the wall time lies in [T + before, T + after), so the transition T is in this range.
  return transitionInstant(timeZone, { low: wall - offsetAfter, high: wall - offsetBefore, laterOffset: offsetAfter });
}
