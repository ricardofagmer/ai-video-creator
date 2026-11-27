import { type PublicationPollingView } from '@studio/shared/api';
import { type Locale } from '@studio/ui';
import { platformSignalRules, type MetricSnapshotOrigin, type MetricSource, type Platform } from '@studio/shared/metrics';
import { formatDecimal, formatInteger, formatIsoDate, formatPercent } from '@/lib/i18n/format';
import { type WebMessages } from '@/messages';

/*
 * Helpers of the metrics screens (SPEC 0006 section 5.9); their texts live in `t.metrics`. Every
 * value shown with them is a text node: URLs, ids and numbers are never rendered as markup.
 */

type MetricTexts = WebMessages['metrics'];

/** Platform names are proper nouns, the same in every locale. */
export const platformLabels: Readonly<Record<Platform, string>> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

export const platformOrder: readonly Platform[] = ['youtube', 'instagram', 'tiktok'];

/** The "Origem" cell of one snapshot; a rev 6 body without `origin` reads it from `source`. */
export function snapshotOriginLabel(snapshot: { source: MetricSource; origin?: MetricSnapshotOrigin }, t: MetricTexts): string {
  if (snapshot.origin !== undefined) return t.history.origins[snapshot.origin];
  return snapshot.source === 'csv' ? t.history.origins['csv-upload'] : t.history.origins.form;
}

/** `yyyy-mm-dd` one day after `isoDate`, by calendar arithmetic in UTC so no time zone moves it. */
function nextIsoDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? isoDate : new Date(date.getTime() + 86_400_000).toISOString().slice(0, 10);
}

/**
 * SPEC 0007 section 5.9, the polling line of a publication: "Próxima coleta: amanhã" while active,
 * "Coleta encerrada: 180 dias" once stopped. `todayIso` is the Mac's local date, injected.
 */
export function pollingLineText(polling: PublicationPollingView, todayIso: string, t: MetricTexts, locale: Locale): string {
  const texts = t.publications.polling;
  if (polling.state === 'stopped') return polling.stopReason === null ? texts.stopped : texts.stopReasons[polling.stopReason];
  if (polling.state === 'not-polled') return texts.notPolled;
  const next = polling.nextPollOn;
  if (next === null || next <= todayIso) return texts.today;
  if (next === nextIsoDate(todayIso)) return texts.tomorrow;
  return texts.on(formatIsoDate(next, locale));
}

/** SPEC 0006 section 5.4: a platform with fewer than 5 eligible videos does not move the score yet. */
export function baselineMissingText(platform: Platform, t: MetricTexts): string {
  return t.publications.baselineMissing(platformSignalRules.baselineMinVideos, platformLabels[platform]);
}

const NO_VALUE = '—';

/** "4.000"; a dash when the platform did not report it. */
export function formatCount(value: number | null, locale: Locale): string {
  return formatInteger(value, locale);
}

/** "45,2%" for `averageViewPercent`, which is already in percent. */
export function formatPercentValue(value: number | null, locale: Locale): string {
  return value === null ? NO_VALUE : `${formatDecimal(value, locale, 1)}%`;
}

/** "6,3%" for a ratio such as `engagementRate`. */
export function formatRate(value: number | null, locale: Locale): string {
  return value === null ? NO_VALUE : formatPercent(value, locale, 1);
}

/** Today in the Mac's local calendar as `yyyy-mm-dd`: the default and the maximum of an `asOfDate`. */
export function localTodayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
