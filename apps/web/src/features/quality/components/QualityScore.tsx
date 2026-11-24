'use client';

import { useI18n } from '@studio/ui';
import type { ReactElement } from 'react';
import { useWebMessages } from '@/lib/i18n/client';
import { qualityScoreText, type QualityFigures } from '../quality-labels';

interface QualityScoreProps extends QualityFigures {
  /** Visible lead-in; "Nota" by default. */
  label?: string;
  className?: string;
}

/**
 * One `qualityScore` with both sample sizes beside it (R2-AC-05, R3-AC-07), as plain text: "Nota:
 * 3,6 (4 execuções, 1 com métricas)", "Nota: 3,6 (4 execuções)" or "Nota: sem nota (sem
 * execuções)". A client component, so server and client screens both render it in the active locale.
 */
export function QualityScore({ qualityScore, qualitySampleSize, qualityPlatformSampleSize, label, className }: QualityScoreProps): ReactElement {
  const texts = useWebMessages().catalog.qualityText;
  const { locale } = useI18n();
  return (
    <span className={className}>
      {`${label ?? texts.label}: `}
      <strong>{qualityScoreText({ qualityScore, qualitySampleSize, qualityPlatformSampleSize }, texts, locale)}</strong>
    </span>
  );
}
