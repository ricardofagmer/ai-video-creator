import { formatNumber, type Locale } from '@studio/ui';
import { type WebMessages } from '@/messages';

type SearchMessages = WebMessages['catalog']['search'];

/** "3 versões ainda não indexadas" / "1 versão ainda não indexada"; null when nothing is pending. */
export function pendingIndexText(pending: number, t: SearchMessages, locale: Locale): string | null {
  if (pending <= 0) return null;
  return t.pendingIndex(pending, formatNumber(pending, locale));
}

/** "Similaridade 0,82": shown as returned; there is no threshold (B10). */
export function similarityText(similarity: number, t: SearchMessages, locale: Locale): string {
  return t.similarity(formatNumber(similarity, locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
}
