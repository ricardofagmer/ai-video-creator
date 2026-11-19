import type { ReactElement } from 'react';
import { qualityScoreText, type QualityFigures } from '../quality-labels';

interface QualityScoreProps extends QualityFigures {
  /** Visible lead-in; "Nota" by default. */
  label?: string;
  className?: string;
}

/**
 * One `qualityScore` with both sample sizes beside it (R2-AC-05, R3-AC-07), as plain text: "Nota:
 * 3,6 (4 execuções, 1 com métricas)", "Nota: 3,6 (4 execuções)" or "Nota: sem nota (sem
 * execuções)". Usable from server and client components.
 */
export function QualityScore({
  qualityScore,
  qualitySampleSize,
  qualityPlatformSampleSize,
  label = 'Nota',
  className,
}: QualityScoreProps): ReactElement {
  return (
    <span className={className}>
      {`${label}: `}
      <strong>{qualityScoreText({ qualityScore, qualitySampleSize, qualityPlatformSampleSize })}</strong>
    </span>
  );
}
