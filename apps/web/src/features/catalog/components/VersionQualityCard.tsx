import { Card, DescriptionList, type DescriptionItem } from '@studio/ui';
import { type AssetVersionView } from '@studio/shared/api';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { QualityFormulaExplanation } from '@/features/quality/components/QualityFormulaExplanation';
import { formatScoreValue, platformSampleSizeLabel, sampleSizeLabel } from '@/features/quality/quality-labels';
import { getI18n } from '@/lib/i18n/server';
import { formatDateTime } from '../catalog-labels';

/**
 * "Nota de qualidade" (SPEC 0003 section 5.1, R2-AC-01, R2-AC-05; SPEC 0006 section 5.4, R3-AC-07):
 * the version's score with both sample sizes (reviewed runs, and those with platform metrics),
 * when it was computed, the state of its row in the search index, and how the score is calculated. No score shows "sem nota", never 0. The score is information only: nothing here
 * activates or compares anything.
 */
export async function VersionQualityCard({ version }: { version: AssetVersionView }): Promise<ReactElement> {
  const { t, locale } = await getI18n();
  const q = t.catalog.quality;
  const items: DescriptionItem[] = [
    { term: q.score, description: version.qualityScore === null ? q.noScore : q.scoreOutOfFive(formatScoreValue(version.qualityScore, locale)) },
    { term: q.reviewedRuns, description: sampleSizeLabel(version.qualitySampleSize, t.catalog.qualityText) },
    { term: q.withPlatformMetrics, description: platformSampleSizeLabel(version.qualityPlatformSampleSize, t.catalog.qualityText) },
    { term: q.scoredAt, description: version.qualityScoredAt === null ? q.notScoredYet : formatDateTime(version.qualityScoredAt, locale) },
    { term: q.semanticSearch, description: t.catalog.search.indexStates[version.searchIndex] },
  ];
  return (
    <Card title={q.title}>
      <div className={layout.stack}>
        <DescriptionList items={items} columns={2} />
        <QualityFormulaExplanation />
      </div>
    </Card>
  );
}
