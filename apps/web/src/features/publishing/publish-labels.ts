import { type Locale } from '@studio/ui';
import { type Platform } from '@studio/shared/metrics';
import { type Visibility } from '@studio/shared/platforms';
import { type WebMessages } from '@/messages';

/*
 * Helpers of the publish dialog (SPEC 0007 section 5.4); the texts live in `t.publishing`. Titles,
 * captions and tags are the owner's own text and are rendered as text nodes only.
 */

/** Q2, OD6: TikTok receives an inbox draft, so its one visibility needs a word of explanation. */
export function visibilityDescription(platform: Platform, visibility: Visibility, t: WebMessages['publishing']): string | undefined {
  if (platform === 'tiktok' && visibility === 'private') return t.fields.tiktokPrivate;
  return undefined;
}

const dateTimeFormatters = new Map<Locale, Intl.DateTimeFormat>();

/** "20/11/2026 10:02" (pt-BR) from an ISO instant, in the Mac's local time, 24-hour clock. */
export function formatInstant(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  let formatter = dateTimeFormatters.get(locale);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    dateTimeFormatters.set(locale, formatter);
  }
  return formatter.format(date).replace(',', '');
}
