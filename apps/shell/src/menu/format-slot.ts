import { type ShellLocale } from '../i18n/locale';

/**
 * `qua., 25/11 09:00` (pt-BR), `Wed, 11/25 09:00` (en): weekday, day and month in the locale's
 * order, and 24-hour time in every locale. `timeZone` is injected by tests; the menu leaves it
 * undefined so the Mac's local zone applies.
 */
export function formatSlot(atMs: number, locale: ShellLocale, timeZone?: string): string {
  const text = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(atMs));
  return text.replace(/, (?=\d{2}:\d{2}$)/, ' ');
}
