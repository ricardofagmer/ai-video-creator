import { type RunStatus, type StageId, type StepName, type StepStatus } from '@studio/shared/run-format';
import { cliLocale, cliText } from '../i18n/messages.js';
import { type CliLocale } from '../i18n/locale.js';

/** Labels of PRD 7.2 run statuses in the active language, as the web shows them (D16). */
export function runStatusLabel(status: RunStatus): string {
  return cliText().runs.statuses[status];
}

export function stepLabel(step: StepName): string {
  return cliText().runs.steps[step];
}

export function stepStatusLabel(status: StepStatus): string {
  return cliText().runs.stepStatuses[status];
}

export function stageLabel(stage: StageId): string {
  return cliText().runs.stages[stage];
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/** One formatter per locale and pattern, built on first use. */
const numberFormatters = new Map<string, Intl.NumberFormat>();

function numberFormatter(locale: CliLocale, key: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const cacheKey = `${locale}|${key}`;
  let formatter = numberFormatters.get(cacheKey);
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat(locale, options);
    numberFormatters.set(cacheKey, formatter);
  }
  return formatter;
}

/** pt-BR keeps its historical `12.4 MB`; es and en use their own decimal mark. */
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 ? 0 : 1;
  const locale = cliLocale();
  const number =
    locale === 'pt-BR'
      ? value.toFixed(digits)
      : numberFormatter(locale, `fixed${digits}`, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false }).format(value);
  return `${number} ${BYTE_UNITS[unit] ?? 'B'}`;
}

/** pt-BR keeps `US$ 1.25`; es and en are the locale's USD format (`1,25 US$`, `$1.25`). */
export function formatUsd(amount: number): string {
  const locale = cliLocale();
  if (locale === 'pt-BR') return `US$ ${amount.toFixed(2)}`;
  return numberFormatter(locale, 'usd', { style: 'currency', currency: 'USD' }).format(amount);
}

/** A number in the active language (`5.000` in pt-BR, `5,000` in en). */
export function formatInteger(value: number): string {
  const locale = cliLocale();
  return numberFormatter(locale, 'integer', { maximumFractionDigits: 0 }).format(value);
}

export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes === 0 ? `${seconds}s` : `${minutes}min ${String(seconds).padStart(2, '0')}s`;
}

const instantFormatters = new Map<CliLocale, Intl.DateTimeFormat>();

/** 24-hour clock in every language; pt-BR keeps the options it always had. */
function instantFormatter(locale: CliLocale): Intl.DateTimeFormat {
  let formatter = instantFormatters.get(locale);
  if (formatter === undefined) {
    const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };
    formatter = new Intl.DateTimeFormat(locale, locale === 'pt-BR' ? options : { ...options, hourCycle: 'h23' });
    instantFormatters.set(locale, formatter);
  }
  return formatter;
}

/**
 * "20/11/2026 10:02" (pt-BR, es) or "11/20/2026 10:02" (en) from an ISO instant, in the Mac's
 * local time, as the web shows it.
 */
export function formatInstant(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : instantFormatter(cliLocale()).format(date).replace(',', '');
}

/** Cuts to `width` characters so table columns stay aligned; never wraps. */
export function fitText(text: string, width: number): string {
  if (text.length <= width) return text.padEnd(width);
  return `${text.slice(0, Math.max(0, width - 1))}…`;
}
