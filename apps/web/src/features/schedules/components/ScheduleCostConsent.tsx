'use client';

import { Alert, Checkbox, DescriptionList, formatUsd, useI18n, type DescriptionItem, type Locale } from '@studio/ui';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { useWebMessages } from '@/lib/i18n/client';
import { type WebMessages } from '@/messages';
import { scheduleFieldIds, type CostFigures } from '../schedule-form-model';

interface ScheduleCostConsentProps {
  figures: CostFigures;
  consented: boolean;
  error: string | undefined;
  disabled: boolean;
  onConsentChange: (consented: boolean) => void;
}

function monthFigureText(figures: CostFigures, t: WebMessages['schedules']['consent'], locale: Locale): string {
  if (figures.worstCasePerMonthUsd === null || figures.slotsNext31Days === null) return t.completeRecurrence;
  return t.monthFigure(formatUsd(figures.worstCasePerMonthUsd, locale), figures.slotsNext31Days);
}

/**
 * The cost consent of the create dialog (SPEC 0006 section 5.5 step 4, L8, R3-06): both worst-case
 * figures, per run and per month, beside the recipe's month ceiling and the guarantee that every
 * scheduled run waits at the plan gate and stops at review. Runs fired while the watcher is in live
 * mode spend real money without a click; this consent is what covers them.
 */
export function ScheduleCostConsent({ figures, consented, error, disabled, onConsentChange }: ScheduleCostConsentProps): ReactElement {
  const { locale } = useI18n();
  const schedules = useWebMessages().schedules;
  const t = schedules.consent;
  const items: DescriptionItem[] = [
    { term: t.perRun, description: formatUsd(figures.perRunUsd, locale) },
    { term: t.perMonth, description: monthFigureText(figures, t, locale) },
    { term: t.monthCeiling, description: formatUsd(figures.monthCeilingUsd, locale) },
  ];
  const overCeiling = figures.worstCasePerMonthUsd !== null && figures.worstCasePerMonthUsd > figures.monthCeilingUsd;
  const monthAmount = figures.worstCasePerMonthUsd === null ? null : formatUsd(figures.worstCasePerMonthUsd, locale);

  return (
    <div className={layout.stack}>
      <DescriptionList items={items} columns={2} />
      {overCeiling && (
        <p className="caption">
          {t.overCeiling}
        </p>
      )}
      <Alert variant="info" title={schedules.safety}>
        {schedules.planGate}
      </Alert>
      <Checkbox
        id={scheduleFieldIds.consent}
        label={t.accept(formatUsd(figures.perRunUsd, locale), monthAmount)}
        invalid={error !== undefined}
        description={error}
        checked={consented}
        disabled={disabled}
        onChange={(event) => onConsentChange(event.currentTarget.checked)}
      />
    </div>
  );
}
