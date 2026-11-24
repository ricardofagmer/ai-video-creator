import { Card, DescriptionList, formatUsd, type DescriptionItem, type Locale } from '@studio/ui';
import { type ComparisonView } from '@studio/shared/api';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { type WebMessages } from '@/messages';
import { StartComparisonButton } from './StartComparisonButton';

/**
 * "Custo" of a comparison (SPEC 0003 section 5.3, B20): what both runs spent so far, the worst
 * case the owner accepts to start them, and the month ceiling the gate checks. The start button
 * shows only while both runs are `draft`.
 */
interface ComparisonCostCardProps {
  comparison: ComparisonView;
  t: WebMessages['curations']['comparisons']['cost'];
  locale: Locale;
}

export function ComparisonCostCard({ comparison, t, locale }: ComparisonCostCardProps): ReactElement {
  const { estimate } = comparison;
  const usd = (amount: number): string => formatUsd(amount, locale);
  const items: DescriptionItem[] = [
    { term: t.soFar, description: usd(comparison.pairCostUsd) },
    { term: t.pairMax, description: usd(estimate.pairWorstCaseUsd) },
    { term: t.runMax, description: usd(estimate.runWorstCaseUsd) },
    { term: t.expected, description: estimate.expectedPairUsd === null ? t.noExpected : usd(estimate.expectedPairUsd) },
    { term: t.monthToDate, description: estimate.monthToDateUsd === null ? t.unavailable : usd(estimate.monthToDateUsd) },
    { term: t.monthCeiling, description: usd(estimate.costPerMonthUsd) },
    { term: t.within, description: estimate.withinMonthCeiling ? t.yes : t.no },
  ];
  return (
    <Card title={t.title}>
      <div className={layout.stack}>
        <DescriptionList items={items} columns={2} />
        {comparison.status === 'draft' && <StartComparisonButton comparisonId={comparison.comparisonId} estimate={estimate} />}
      </div>
    </Card>
  );
}
