'use client';

import { Alert, Checkbox, DescriptionList, formatUsd, type DescriptionItem } from '@studio/ui';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { PLAN_GATE_TEXT, SCHEDULE_SAFETY_TEXT } from '../schedule-labels';
import { scheduleFieldIds, type CostFigures } from '../schedule-form-model';

interface ScheduleCostConsentProps {
  figures: CostFigures;
  consented: boolean;
  error: string | undefined;
  disabled: boolean;
  onConsentChange: (consented: boolean) => void;
}

function monthFigureText(figures: CostFigures): string {
  if (figures.worstCasePerMonthUsd === null || figures.slotsNext31Days === null) return 'Complete a repetição para calcular.';
  const runs = figures.slotsNext31Days === 1 ? '1 execução' : `${figures.slotsNext31Days} execuções`;
  return `${formatUsd(figures.worstCasePerMonthUsd)} (${runs} nos próximos 31 dias)`;
}

/**
 * The cost consent of the create dialog (SPEC 0006 section 5.5 step 4, L8, R3-06): both worst-case
 * figures, per run and per month, beside the recipe's month ceiling and the guarantee that every
 * scheduled run waits at the plan gate and stops at review. Runs fired while the watcher is in live
 * mode spend real money without a click; this consent is what covers them.
 */
export function ScheduleCostConsent({ figures, consented, error, disabled, onConsentChange }: ScheduleCostConsentProps): ReactElement {
  const items: DescriptionItem[] = [
    { term: 'Custo máximo por execução', description: formatUsd(figures.perRunUsd) },
    { term: 'Custo máximo por mês', description: monthFigureText(figures) },
    { term: 'Teto de gasto do mês', description: formatUsd(figures.monthCeilingUsd) },
  ];
  const overCeiling = figures.worstCasePerMonthUsd !== null && figures.worstCasePerMonthUsd > figures.monthCeilingUsd;
  const monthText = figures.worstCasePerMonthUsd === null ? '' : ` (até ${formatUsd(figures.worstCasePerMonthUsd)} por mês)`;

  return (
    <div className={layout.stack}>
      <DescriptionList items={items} columns={2} />
      {overCeiling && (
        <p className="caption">
          O custo máximo por mês passa do teto. Quando o gasto do mês chegar ao teto, os horários seguintes são pulados, sem gasto.
        </p>
      )}
      <Alert variant="info" title={SCHEDULE_SAFETY_TEXT}>
        {PLAN_GATE_TEXT}
      </Alert>
      <Checkbox
        id={scheduleFieldIds.consent}
        label={`Aceito o custo máximo de ${formatUsd(figures.perRunUsd)} por execução agendada${monthText}`}
        invalid={error !== undefined}
        description={error}
        checked={consented}
        disabled={disabled}
        onChange={(event) => onConsentChange(event.currentTarget.checked)}
      />
    </div>
  );
}
