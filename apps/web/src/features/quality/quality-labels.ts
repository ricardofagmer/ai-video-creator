/**
 * pt-BR display of `qualityScore` (SPEC 0003 section 5.1, R2-AC-01, R2-AC-05; SPEC 0006 section 5.4,
 * R3-AC-07): one decimal, always with its sample sizes. A version with no reviewed run shows "sem
 * nota" and "sem execuções", never the digit 0, so a missing score cannot be read as a bad one.
 */

const scoreFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const NO_SCORE_TEXT = 'sem nota';
const NO_RUNS_TEXT = 'sem execuções';

/** "4 execuções" / "1 execução"; "sem execuções" when there are none. */
export function sampleSizeLabel(sampleSize: number): string {
  if (sampleSize <= 0) return NO_RUNS_TEXT;
  return sampleSize === 1 ? '1 execução' : `${sampleSize} execuções`;
}

/** "nenhuma" / "1 execução" / "3 execuções": the reviewed runs whose video has platform metrics. */
export function platformSampleSizeLabel(platformSampleSize: number): string {
  if (platformSampleSize <= 0) return 'nenhuma';
  return platformSampleSize === 1 ? '1 execução' : `${platformSampleSize} execuções`;
}

/** "3,6" for a score; null scores have no number at all. */
export function formatScoreValue(score: number): string {
  return scoreFormatter.format(score);
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
export function qualityScoreText({ qualityScore, qualitySampleSize, qualityPlatformSampleSize }: QualityFigures): string {
  if (qualityScore === null) return `${NO_SCORE_TEXT} (${sampleSizeLabel(0)})`;
  const runs = sampleSizeLabel(qualitySampleSize);
  if (qualityPlatformSampleSize === null || qualityPlatformSampleSize <= 0) return `${formatScoreValue(qualityScore)} (${runs})`;
  return `${formatScoreValue(qualityScore)} (${runs}, ${qualityPlatformSampleSize} com métricas)`;
}
