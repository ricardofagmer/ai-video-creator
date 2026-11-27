import { type Locale } from '../i18n/locale';

const byteUnits = ['B', 'KB', 'MB', 'GB', 'TB'];

const usdFormatters = new Map<Locale, Intl.NumberFormat>();

function usdFormatter(locale: Locale): Intl.NumberFormat {
  let formatter = usdFormatters.get(locale);
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    usdFormatters.set(locale, formatter);
  }
  return formatter;
}

/** Formats a USD amount for the locale, for example `US$ 1,25` (pt-BR) or `$1.25` (en). */
export function formatUsd(amount: number, locale: Locale): string {
  return usdFormatter(locale).format(amount);
}

/** Formats a byte count with a binary unit, for example `12,4 MB` (pt-BR) or `12.4 MB` (en). */
export function formatBytes(sizeBytes: number, locale: Locale): string {
  let value = sizeBytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < byteUnits.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = unitIndex === 0 ? 0 : 1;
  return `${value.toLocaleString(locale, { maximumFractionDigits: digits })} ${byteUnits[unitIndex] ?? 'B'}`;
}

/** Formats a number with the locale's separators. */
export function formatNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

export type DateInput = Date | number | string;

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

/** A calendar date in the locale's short style, for example `22/11/2026` (pt-BR) or `11/22/2026` (en). */
export function formatDate(value: DateInput, locale: Locale, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeZone }).format(toDate(value));
}

/** Date and time in the locale's short style. */
export function formatDateTime(value: DateInput, locale: Locale, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short', timeZone }).format(toDate(value));
}

const RELATIVE_UNITS: readonly { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
  { unit: 'day', seconds: 86_400 },
  { unit: 'hour', seconds: 3_600 },
  { unit: 'minute', seconds: 60 },
];

/** A relative time such as "há 5 minutos" / "5 minutes ago"; `now` is injectable for callers that test it. */
export function formatRelative(value: DateInput, locale: Locale, now: number = Date.now()): string {
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const diffSeconds = Math.round((toDate(value).getTime() - now) / 1000);
  for (const { unit, seconds } of RELATIVE_UNITS) {
    if (Math.abs(diffSeconds) >= seconds) return formatter.format(Math.round(diffSeconds / seconds), unit);
  }
  return formatter.format(diffSeconds, 'second');
}

/** Shortens a sha-256 hex digest for display; the full value stays in `title`. */
export function shortenHash(contentHash: string, length = 12): string {
  return contentHash.length > length ? `${contentHash.slice(0, length)}…` : contentHash;
}
