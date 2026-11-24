'use client';

import { CostMeter, DescriptionList, formatUsd, useI18n } from '@studio/ui';
import { type ReactElement } from 'react';
import { useWebMessages } from '@/lib/i18n/client';

interface MonthSpendMeterProps {
  /** `RunStateResponse.monthSpendUsd`: null when the api could not sum the month (A21). */
  monthSpendUsd: number | null;
  /** `run.limits.costPerMonthUsd`. */
  limitUsd: number;
}

/**
 * design/telas/07 "Gasto do mês" against the monthly limit. A null value is shown as
 * "indisponível", never as zero: the api had no honest number (SPEC 0002 rev 4, A21).
 */
export function MonthSpendMeter({ monthSpendUsd, limitUsd }: MonthSpendMeterProps): ReactElement {
  const t = useWebMessages().runs.run;
  const { locale } = useI18n();
  const MONTH_LABEL = t.monthSpend;
  if (monthSpendUsd === null) {
    return (
      <DescriptionList
        items={[
          {
            term: MONTH_LABEL,
            description: t.monthSpendUnavailable(formatUsd(limitUsd, locale)),
          },
        ]}
      />
    );
  }
  return <CostMeter label={MONTH_LABEL} spentUsd={monthSpendUsd} limitUsd={limitUsd} />;
}
