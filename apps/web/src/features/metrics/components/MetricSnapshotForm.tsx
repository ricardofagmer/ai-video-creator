'use client';

import { Alert, Button, FormField, Input, useI18n } from '@studio/ui';
import { type MetricName } from '@studio/shared/metrics';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactElement } from 'react';
import { describeApiError } from '@/features/common/api-error-text';
import { useWebMessages } from '@/lib/i18n/client';
import { type WebMessages } from '@/messages';
import layout from '@/features/common/layout.module.css';
import { formatIsoDate } from '@/lib/i18n/format';
import { localTodayIso } from '../metric-labels';
import {
  buildMetricSnapshot,
  emptyMetricValues,
  metricFieldOrder,
  type MetricFormErrors,
  type MetricFormValues,
} from '../metric-form-model';
import { browserMetricsApi } from '../metrics-api';
import styles from '../metrics.module.css';

interface MetricSnapshotFormProps {
  runId: string;
  publicationId: string;
}

/** The help line of the three fields whose format needs one. */
function fieldHelpOf(field: MetricName, help: WebMessages['metrics']['fieldHelp']): string | undefined {
  switch (field) {
    case 'watchTimeSeconds':
    case 'averageViewDurationSeconds':
    case 'averageViewPercent':
      return help[field];
    default:
      return undefined;
  }
}

const focusOrder: readonly (MetricName | 'asOfDate')[] = ['asOfDate', ...metricFieldOrder];

type SaveState = { status: 'idle' } | { status: 'saving' } | { status: 'saved'; asOfDate: string } | { status: 'failed'; message: string };

/**
 * "Métricas em {data}" (SPEC 0006 section 5.9, OD2): the manual form for one publication, with the
 * fields of `PlatformMetrics`; only "Visualizações" is required. Saving the same date again
 * replaces the earlier form snapshot for that date (section 4.4). Ids are prefixed with the
 * publication id, since a run page can hold up to five of these forms.
 */
export function MetricSnapshotForm({ runId, publicationId }: MetricSnapshotFormProps): ReactElement {
  const t = useWebMessages();
  const texts = t.metrics.snapshotForm;
  const { locale } = useI18n();
  const router = useRouter();
  const [asOfDate, setAsOfDate] = useState(() => localTodayIso());
  const [values, setValues] = useState<MetricFormValues>(emptyMetricValues);
  const [errors, setErrors] = useState<MetricFormErrors>({});
  const [save, setSave] = useState<SaveState>({ status: 'idle' });

  const pending = save.status === 'saving';
  const idOf = (field: MetricName | 'asOfDate'): string => `metricas-${publicationId}-${field}`;

  function update(field: MetricName, value: string): void {
    setValues((previous) => ({ ...previous, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    const result = buildMetricSnapshot({ asOfDate, values, today: localTodayIso() }, texts.errors);
    if (result.kind === 'invalid') {
      setErrors(result.errors);
      const first = focusOrder.find((field) => result.errors[field] !== undefined);
      if (first !== undefined) document.getElementById(idOf(first))?.focus();
      return;
    }
    setErrors({});
    setSave({ status: 'saving' });
    try {
      await browserMetricsApi.saveSnapshot({ runId, publicationId, asOfDate: result.asOfDate, metrics: result.metrics });
      setSave({ status: 'saved', asOfDate: result.asOfDate });
      setValues(emptyMetricValues());
      router.refresh();
    } catch (error) {
      setSave({ status: 'failed', message: describeApiError(error, t) });
    }
  }

  const heading = asOfDate === '' ? texts.heading : texts.headingOn(formatIsoDate(asOfDate, locale));

  return (
    <form className={layout.stack} onSubmit={(event) => void handleSubmit(event)} noValidate aria-label={heading}>
      <h4 className="label">{heading}</h4>
      {save.status === 'failed' && <Alert variant="error">{save.message}</Alert>}
      {save.status === 'saved' && (
        <Alert variant="success">{texts.saved(formatIsoDate(save.asOfDate, locale))}</Alert>
      )}
      <div className={layout.fieldGrid}>
        <FormField
          id={idOf('asOfDate')}
          label={texts.asOfDate}
          help={texts.asOfDateHelp}
          error={errors.asOfDate}
          disabled={pending}
        >
          {({ invalid, ...control }) => (
            <Input
              {...control}
              type="date"
              invalid={invalid}
              max={localTodayIso()}
              value={asOfDate}
              onChange={(event) => setAsOfDate(event.currentTarget.value)}
            />
          )}
        </FormField>
        {metricFieldOrder.map((field) => {
          const help = fieldHelpOf(field, t.metrics.fieldHelp);
          return (
            <FormField
              key={field}
              id={idOf(field)}
              label={t.metrics.fields[field]}
              optional={field !== 'views'}
              help={help}
              error={errors[field]}
              disabled={pending}
            >
              {({ invalid, ...control }) => (
                <Input
                  {...control}
                  inputMode="decimal"
                  autoComplete="off"
                  invalid={invalid}
                  maxLength={20}
                  value={values[field]}
                  onChange={(event) => update(field, event.currentTarget.value)}
                />
              )}
            </FormField>
          );
        })}
      </div>
      <div className={styles.actions}>
        <Button type="submit" variant="secondary" loading={pending} loadingLabel={texts.saving}>
          {texts.save}
        </Button>
      </div>
    </form>
  );
}
