'use client';

import { useI18n, type Locale } from '@studio/ui';
import { QUALITY_SCORE_FORMULA_VERSION, qualityScoreWeights } from '@studio/shared/catalog';
import { platformSignalRules } from '@studio/shared/metrics';
import type { ReactElement } from 'react';
import { formatDecimal } from '@/lib/i18n/format';
import { useWebMessages } from '@/lib/i18n/client';
import { formatScoreValue } from '../quality-labels';
import styles from '../quality.module.css';

function weight(value: number, locale: Locale): string {
  return formatDecimal(value, locale, 2, true);
}

/** "-0,70" / "+0,60": the bounds of SPEC 0006 L3, signed so the direction is explicit. */
function formatSignedWeight(value: number, locale: Locale): string {
  return `${value > 0 ? '+' : ''}${weight(value, locale)}`;
}

/**
 * "Como a nota é calculada" (SPEC 0003 section 5.1, SPEC 0006 section 5.4): the formula and its
 * known limits, written from the shared constants (`qualityScoreWeights`, `platformSignalRules`),
 * so the text cannot drift from what core computes. A native `<details>` keeps it out of the way
 * and keyboard reachable.
 */
export function QualityFormulaExplanation(): ReactElement {
  const texts = useWebMessages().catalog.formula;
  const { locale } = useI18n();
  const weights = qualityScoreWeights;
  const { minViews, baselineMinVideos } = platformSignalRules;
  // The largest nudges of SPEC 0006 L3, derived from the weights so they move with them.
  const largestRaise = weights.reviewer + weights.qa + weights.platform;
  const largestCut = -(weights.reviewer + weights.qa + weights.recovery + weights.platform);
  return (
    <details className={styles.explanation}>
      <summary className={styles.summary}>{texts.summary}</summary>
      <div className={styles.body}>
        <p>
          {texts.ratingAndSignals({
            reviewer: weight(weights.reviewer, locale),
            qa: weight(weights.qa, locale),
            recovery: weight(weights.recovery, locale),
            recoveryCap: weights.recoveryCap,
          })}
        </p>
        <p>
          {texts.platforms({
            platform: weight(weights.platform, locale),
            minViews,
            baselineMinVideos,
            cut: formatSignedWeight(largestCut, locale),
            raise: formatSignedWeight(largestRaise, locale),
          })}
        </p>
        <p>{texts.prior({ priorWeight: weights.priorWeight, priorMinRuns: weights.priorMinRuns, neutral: formatScoreValue(weights.priorNeutral, locale) })}</p>
        <p>{texts.limits(QUALITY_SCORE_FORMULA_VERSION)}</p>
      </div>
    </details>
  );
}
