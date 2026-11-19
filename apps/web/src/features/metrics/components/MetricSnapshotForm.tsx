'use client';

import { Alert, Button, FormField, Input } from '@studio/ui';
import { type MetricName } from '@studio/shared/metrics';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactElement } from 'react';
import { describeApiError } from '@/features/common/api-error-text';
import layout from '@/features/common/layout.module.css';
import { formatIsoDate, localTodayIso } from '../metric-labels';
import {
  buildMetricSnapshot,
  emptyMetricValues,
  metricFieldOrder,
  metricFieldSpecs,
  type MetricFormErrors,
  type MetricFormValues,
} from '../metric-form-model';
import { browserMetricsApi } from '../metrics-api';
import styles from '../metrics.module.css';

interface MetricSnapshotFormProps {
  runId: string;
  publicationId: string;
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
    const result = buildMetricSnapshot({ asOfDate, values, today: localTodayIso() });
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
      setSave({ status: 'failed', message: describeApiError(error) });
    }
  }

  const heading = asOfDate === '' ? 'Métricas' : `Métricas em ${formatIsoDate(asOfDate)}`;

  return (
    <form className={layout.stack} onSubmit={(event) => void handleSubmit(event)} noValidate aria-label={heading}>
      <h4 className="label">{heading}</h4>
      {save.status === 'failed' && <Alert variant="error">{save.message}</Alert>}
      {save.status === 'saved' && (
        <Alert variant="success">{`Métricas de ${formatIsoDate(save.asOfDate)} salvas. A nota é recalculada em seguida.`}</Alert>
      )}
      <div className={layout.fieldGrid}>
        <FormField
          id={idOf('asOfDate')}
          label="Números referentes a"
          help="O dia a que os totais se referem. Nunca no futuro."
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
          const spec = metricFieldSpecs[field];
          return (
            <FormField
              key={field}
              id={idOf(field)}
              label={spec.label}
              optional={field !== 'views'}
              help={spec.help}
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
        <Button type="submit" variant="secondary" loading={pending} loadingLabel="Salvando…">
          Salvar métricas
        </Button>
      </div>
    </form>
  );
}
