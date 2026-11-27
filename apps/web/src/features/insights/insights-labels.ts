import { type BadgeTone, type Locale } from '@studio/ui';
import { formatDecimal } from '@/lib/i18n/format';
import { type WebMessages } from '@/messages';

type InsightTexts = WebMessages['metrics']['insights'];

const minuteMs = 60_000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;

const percentFormatters = new Map<Locale, Intl.NumberFormat>();

/** `87%`; `sem dados` when there is nothing to divide. */
export function formatShare(share: number | null, t: InsightTexts, locale: Locale): string {
  if (share === null) return t.noData;
  let formatter = percentFormatters.get(locale);
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 });
    percentFormatters.set(locale, formatter);
  }
  return formatter.format(share);
}

/** `3,6` (a mean rating, 1 to 5). */
export function formatRating(rating: number, locale: Locale): string {
  return formatDecimal(rating, locale, 1, true);
}

/** `2 d 4 h`, `3 h 15 min`, `12 min`, `menos de 1 min`. */
export function formatDuration(ms: number, t: InsightTexts): string {
  if (ms < minuteMs) return t.lessThanMinute;
  if (ms >= dayMs) return `${Math.floor(ms / dayMs)} d ${Math.floor((ms % dayMs) / hourMs)} h`;
  if (ms >= hourMs) return `${Math.floor(ms / hourMs)} h ${Math.floor((ms % hourMs) / minuteMs)} min`;
  return `${Math.floor(ms / minuteMs)} min`;
}

export interface TargetVerdict {
  label: string;
  tone: BadgeTone;
}

/** `met` true, false or null (not enough data yet). */
export function targetVerdict(isMet: boolean | null, t: InsightTexts): TargetVerdict {
  if (isMet === null) return { label: t.verdicts.noData, tone: 'neutral' };
  return isMet ? { label: t.verdicts.met, tone: 'success' } : { label: t.verdicts.missed, tone: 'warning' };
}
