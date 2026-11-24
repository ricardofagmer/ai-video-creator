import { formatDate as formatLocaleDate, formatDateTime as formatLocaleDateTime, type Locale } from '@studio/ui';

/*
 * Kind, status and sensitivity labels come from `t.catalog.kinds` and `ui.status.*` for the active
 * locale; this module only keeps the date helpers of the catalog screens.
 */

/** `18/11/2026` (pt-BR) from an ISO instant or date; a date-only value is read as local midnight. */
export function formatDate(iso: string, locale: Locale): string {
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(date.getTime()) ? iso : formatLocaleDate(date, locale);
}

/** `18/11/2026 14:32` (pt-BR) from an ISO instant. */
export function formatDateTime(iso: string, locale: Locale): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : formatLocaleDateTime(date, locale);
}
