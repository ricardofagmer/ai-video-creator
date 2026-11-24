import { type Locale } from '@studio/ui';
import { formatDecimal } from '@/lib/i18n/format';
import { type WebMessages } from '@/messages';

/**
 * Display of `qualityScore` (SPEC 0003 section 5.1, R2-AC-01, R2-AC-05; SPEC 0006 section 5.4,
 * R3-AC-07): one decimal, always with its sample sizes. A version with no reviewed run shows "sem
 * nota" and "sem execuções", never the digit 0, so a missing score cannot be read as a bad one.
 */

export type QualityTexts = WebMessages['catalog']['qualityText'];

/** "4 execuções" / "1 execução"; "sem execuções" when there are none. */
export function sampleSizeLabel(sampleSize: number, t: QualityTexts): string {
  return sampleSize <= 0 ? t.noRuns : t.runs(sampleSize);
}

/** "nenhuma" / "1 execução" / "3 execuções": the reviewed runs whose video has platform metrics. */
export function platformSampleSizeLabel(platformSampleSize: number, t: QualityTexts): string {
  return platformSampleSize <= 0 ? t.noneWithMetrics : t.runs(platformSampleSize);
}

/** "3,6" (pt-BR), "3.6" (en) for a score; null scores have no number at all. */
export function formatScoreValue(score: number, locale: Locale): string {
  return formatDecimal(score, locale, 1, true);
}

export interface QualityFigures {
  qualityScore: number | null;
  qualitySampleSize: number;
  /**
   * `qualityPlatformSampleSize` (SPEC 0006 section 5.4). Null only where the C10 source of the
   * figures does not carry it (the score frozen in a promotion approval, a comparison arm), so the
   * screen can never invent a count.
   */
  qualityPlatformSampleSize: number | null;
}

/**
 * The SPEC 0006 section 5.4 display as one string: "3,6 (4 execuções, 1 com métricas)"; with no
 * run carrying platform metrics "3,6 (4 execuções)"; with no reviewed run "sem nota (sem
 * execuções)".
 */
export function qualityScoreText(
  { qualityScore, qualitySampleSize, qualityPlatformSampleSize }: QualityFigures,
  t: QualityTexts,
  locale: Locale,
): string {
  if (qualityScore === null) return `${t.noScore} (${sampleSizeLabel(0, t)})`;
  const runs = sampleSizeLabel(qualitySampleSize, t);
  if (qualityPlatformSampleSize === null || qualityPlatformSampleSize <= 0) return `${formatScoreValue(qualityScore, locale)} (${runs})`;
  return `${formatScoreValue(qualityScore, locale)} (${runs}, ${t.withMetrics(qualityPlatformSampleSize)})`;
}
