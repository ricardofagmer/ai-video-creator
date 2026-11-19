import { Card, DescriptionList, formatUsd, type DescriptionItem } from '@studio/ui';
import { type ComparisonView } from '@studio/shared/api';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { StartComparisonButton } from './StartComparisonButton';

/**
 * "Custo" of a comparison (SPEC 0003 section 5.3, B20): what both runs spent so far, the worst
 * case the owner accepts to start them, and the month ceiling the gate checks. The start button
 * shows only while both runs are `draft`.
 */
export function ComparisonCostCard({ comparison }: { comparison: ComparisonView }): ReactElement {
  const { estimate } = comparison;
  const items: DescriptionItem[] = [
    { term: 'Custo do par até agora', description: formatUsd(comparison.pairCostUsd) },
    { term: 'Custo máximo do par', description: formatUsd(estimate.pairWorstCaseUsd) },
    { term: 'Custo máximo por execução', description: formatUsd(estimate.runWorstCaseUsd) },
    {
      term: 'Custo esperado do par',
      description: estimate.expectedPairUsd === null ? 'Sem execuções pagas revisadas para estimar' : formatUsd(estimate.expectedPairUsd),
    },
    { term: 'Gasto do mês até agora', description: estimate.monthToDateUsd === null ? 'Indisponível' : formatUsd(estimate.monthToDateUsd) },
    { term: 'Teto do mês', description: formatUsd(estimate.costPerMonthUsd) },
    { term: 'Dentro do teto do mês', description: estimate.withinMonthCeiling ? 'Sim' : 'Não' },
  ];
  return (
    <Card title="Custo">
      <div className={layout.stack}>
        <DescriptionList items={items} columns={2} />
        {comparison.status === 'draft' && <StartComparisonButton comparisonId={comparison.comparisonId} estimate={estimate} />}
      </div>
    </Card>
  );
}
