import { Card, DescriptionList, type DescriptionItem } from '@studio/ui';
import { type AssetVersionView } from '@studio/shared/api';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { QualityFormulaExplanation } from '@/features/quality/components/QualityFormulaExplanation';
import { formatScoreValue, platformSampleSizeLabel, sampleSizeLabel } from '@/features/quality/quality-labels';
import { searchIndexLabels } from '@/features/search/search-labels';
import { formatDateTime } from '../catalog-labels';

/**
 * "Nota de qualidade" (SPEC 0003 section 5.1, R2-AC-01, R2-AC-05; SPEC 0006 section 5.4, R3-AC-07):
 * the version's score with both sample sizes (reviewed runs, and those with platform metrics),
 * when it was computed, the state of its row in the search index, and how the score is calculated. No score shows "sem nota", never 0. The score is information only: nothing here
 * activates or compares anything.
 */
export function VersionQualityCard({ version }: { version: AssetVersionView }): ReactElement {
  const items: DescriptionItem[] = [
    { term: 'Nota', description: version.qualityScore === null ? 'sem nota' : `${formatScoreValue(version.qualityScore)} de 5` },
    { term: 'Execuções revisadas', description: sampleSizeLabel(version.qualitySampleSize) },
    { term: 'Com métricas das plataformas', description: platformSampleSizeLabel(version.qualityPlatformSampleSize) },
    { term: 'Calculada em', description: version.qualityScoredAt === null ? 'Ainda não calculada' : formatDateTime(version.qualityScoredAt) },
    { term: 'Busca por significado', description: searchIndexLabels[version.searchIndex] },
  ];
  return (
    <Card title="Nota de qualidade">
      <div className={layout.stack}>
        <DescriptionList items={items} columns={2} />
        <QualityFormulaExplanation />
      </div>
    </Card>
  );
}
