/** pt-BR short weekday labels, keyed by the `en-US` short weekday Intl answers with. */
const WEEKDAY_LABELS: Readonly<Record<string, string>> = {
  Mon: 'seg.',
  Tue: 'ter.',
  Wed: 'qua.',
  Thu: 'qui.',
  Fri: 'sex.',
  Sat: 'sáb.',
  Sun: 'dom.',
};

/** pt-BR short weekday labels by ISO number (1 = Monday), as the recurrence stores them. */
export const ISO_WEEKDAY_LABELS: readonly string[] = ['', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.', 'dom.'];

interface LocalSlotParts {
  weekday: string;
  day: string;
  month: string;
  hour: string;
  minute: string;
}

/**
 * The wall-clock parts of an instant in the schedule's IANA zone. Parts come from a fixed `en-US`
 * numeric format and the weekday is mapped here, so the text does not depend on the runtime's
 * pt-BR locale data.
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
  return {
    weekday: WEEKDAY_LABELS[parts['weekday'] ?? ''] ?? '',
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

/** `qua., 25/11 09:00`: the form the web list uses ("Próxima: qua., 25/11 09:00"). */
export function formatSlotLong(instant: string, timeZone: string): string {
  const parts = localSlotParts(instant, timeZone);
  return `${parts.weekday}, ${parts.day}/${parts.month} ${parts.hour}:${parts.minute}`;
}
