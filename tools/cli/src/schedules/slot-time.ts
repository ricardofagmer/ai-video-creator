import { cliText } from '../i18n/messages.js';

type ShortWeekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

/** ISO weekday numbers (1 = Monday), as the recurrence stores them. */
const ISO_WEEKDAYS: readonly ShortWeekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function isShortWeekday(value: string): value is ShortWeekday {
  return ISO_WEEKDAYS.some((weekday) => weekday === value);
}

/** The short weekday label of an ISO weekday number in the active language (`seg.`, `lun`, `Mon`). */
export function isoWeekdayLabel(weekday: number): string | undefined {
  const key = ISO_WEEKDAYS[weekday - 1];
  return key === undefined ? undefined : cliText().schedules.weekdays[key];
}

interface LocalSlotParts {
  weekday: string;
  day: string;
  month: string;
  hour: string;
  minute: string;
}

/**
 * The wall-clock parts of an instant in the schedule's IANA zone. Parts come from a fixed `en-US`
 * numeric format and the weekday is mapped through the catalogue, so the text does not depend on
 * the runtime's locale data.
 */
function localSlotParts(instant: string, timeZone: string): LocalSlotParts {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts: Record<string, string> = {};
  for (const part of format.formatToParts(new Date(instant))) parts[part.type] = part.value;
  const weekday = parts['weekday'] ?? '';
  return {
    weekday: isShortWeekday(weekday) ? cliText().schedules.weekdays[weekday] : '',
    day: parts['day'] ?? '',
    month: parts['month'] ?? '',
    hour: parts['hour'] ?? '',
    minute: parts['minute'] ?? '',
  };
}

/** `qua. 09:00`: the `studio status` form (SPEC 0006 section 5.7). */
export function formatSlotShort(instant: string, timeZone: string): string {
  const parts = localSlotParts(instant, timeZone);
  return `${parts.weekday} ${parts.hour}:${parts.minute}`;
}

/** `qua., 25/11 09:00` (en `Wed, 11/25 09:00`): the form the web list uses ("Próxima: qua., 25/11 09:00"). */
export function formatSlotLong(instant: string, timeZone: string): string {
  const parts = localSlotParts(instant, timeZone);
  return `${parts.weekday}, ${cliText().schedules.dayMonth(parts.day, parts.month)} ${parts.hour}:${parts.minute}`;
}
