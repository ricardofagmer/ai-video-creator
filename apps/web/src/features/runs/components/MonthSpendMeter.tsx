import { CostMeter, DescriptionList, formatUsd } from '@studio/ui';
import { type ReactElement } from 'react';

interface MonthSpendMeterProps {
  /** `RunStateResponse.monthSpendUsd`: null when the api could not sum the month (A21). */
  monthSpendUsd: number | null;
  /** `run.limits.costPerMonthUsd`. */
  limitUsd: number;
}

const MONTH_LABEL = 'Gasto do mês';

/**
 * design/telas/07 "Gasto do mês" against the monthly limit. A null value is shown as
 * "indisponível", never as zero: the api had no honest number (SPEC 0002 rev 4, A21).
 */
export function MonthSpendMeter({ monthSpendUsd, limitUsd }: MonthSpendMeterProps): ReactElement {
  if (monthSpendUsd === null) {
    return (
      <DescriptionList
        items={[
          {
            term: MONTH_LABEL,
            description: `indisponível · limite de ${formatUsd(limitUsd)}. O limite mensal continua valendo para novas etapas.`,
          },
        ]}
      />
    );
  }
  return <CostMeter label={MONTH_LABEL} spentUsd={monthSpendUsd} limitUsd={limitUsd} />;
}
