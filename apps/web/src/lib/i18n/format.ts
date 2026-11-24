import { type Locale } from '@studio/ui';

/*
 * Locale-aware formatters of the web that `@studio/ui` does not cover. Every function takes the
 * active locale; none falls back to a default, so a caller that forgets it fails typecheck. The
 * clock is 24-hour in every locale (schedule times are typed as `HH:MM`), and pt-BR output stays
 * exactly what the screens showed before the other languages existed.
 */

const NO_VALUE = '—';

function cached<T>(cache: Map<string, T>, key: string, create: () => T): T {
  let value = cache.get(key);
  if (value === undefined) {
    value = create();
    cache.set(key, value);
  }
  return value;
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const numberFormatters = new Map<string, Intl.NumberFormat>();

function dateFormatter(locale: Locale, key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return cached(dateFormatters, `${locale}|${key}`, () => new Intl.DateTimeFormat(locale, options));
}

function numberFormatter(locale: Locale, key: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  return cached(numberFormatters, `${locale}|${key}`, () => new Intl.NumberFormat(locale, options));
}

/** `19/11/2026` (pt-BR), `11/19/2026` (en) from a C10 `yyyy-mm-dd`, read in UTC so no time zone moves the day. */
export function formatIsoDate(isoDate: string, locale: Locale): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate) || Number.isNaN(date.getTime())) return isoDate;
  return dateFormatter(locale, 'iso-date', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function slotText(iso: string, timeZone: string, locale: Locale, withYear: boolean): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const formatter = dateFormatter(locale, `slot|${timeZone}|${withYear}`, {
    timeZone,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: withYear ? 'numeric' : undefined,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return formatter.format(date).replace(/, (?=\d{2}:\d{2}$)/, ' ');
}

/** `qua., 25/11 09:00` (pt-BR), `Wed, 11/25 09:00` (en), in the schedule's own time zone. */
export function formatSlot(iso: string, timeZone: string, locale: Locale): string {
  return slotText(iso, timeZone, locale, false);
}

/** `qua., 25/11/2026 09:00` for the slot log, where entries can be months apart. */
export function formatSlotWithYear(iso: string, timeZone: string, locale: Locale): string {
  return slotText(iso, timeZone, locale, true);
}

/** `4.000` (pt-BR), `4,000` (en); a dash when the value is unknown. */
export function formatInteger(value: number | null, locale: Locale): string {
  return value === null ? NO_VALUE : numberFormatter(locale, 'integer', { maximumFractionDigits: 0 }).format(value);
}

/** A number with up to (or exactly, with `fixed`) `digits` decimals: `3,6` (pt-BR), `3.6` (en). */
export function formatDecimal(value: number, locale: Locale, digits = 1, fixed = false): string {
  return numberFormatter(locale, `decimal|${digits}|${fixed}`, {
    minimumFractionDigits: fixed ? digits : 0,
    maximumFractionDigits: digits,
  }).format(value);
}

/** A ratio as a percentage: `0.063` gives `6,3%` (pt-BR) with one fixed decimal. */
export function formatPercent(ratio: number, locale: Locale, digits = 1): string {
  return numberFormatter(locale, `percent|${digits}`, {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(ratio);
}
