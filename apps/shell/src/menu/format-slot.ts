/**
 * `qua., 25/11 09:00`: weekday, day/month and 24-hour time. `timeZone` is injected by tests; the
 * menu leaves it undefined so the Mac's local zone applies.
 */
export function formatSlot(atMs: number, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).formatToParts(new Date(atMs));
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('weekday')}, ${part('day')}/${part('month')} ${part('hour')}:${part('minute')}`;
}
