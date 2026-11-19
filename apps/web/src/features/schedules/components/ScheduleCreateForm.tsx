'use client';

import { Alert, FormField, Input, Select } from '@studio/ui';
import { type RecipeVersionView, type ScheduleView } from '@studio/shared/api';
import { scheduleBounds } from '@studio/shared/schedules';
import { useState, type FormEvent, type ReactElement } from 'react';
import { describeApiError } from '@/features/common/api-error-text';
import layout from '@/features/common/layout.module.css';
import { assetStatusLabels } from '@/features/catalog/catalog-labels';
import { localTodayIso } from '@/features/metrics/metric-labels';
import {
  buildRecurrence,
  costFigures,
  initialScheduleValues,
  scheduleFieldIds,
  scheduleFieldOrder,
  timeZoneOptions,
  titleError,
  type QueuedBrief,
  type ScheduleErrors,
  type ScheduleFormValues,
} from '../schedule-form-model';
import { browserSchedulesApi } from '../schedules-api';
import styles from '../schedules.module.css';
import { ScheduleBriefQueueEditor } from './ScheduleBriefQueueEditor';
import { ScheduleCostConsent } from './ScheduleCostConsent';
import { ScheduleRecurrenceFields } from './ScheduleRecurrenceFields';

interface ScheduleCreateFormProps {
  formId: string;
  /** Runnable recipe versions (draft or active); never empty here. */
  recipes: readonly RecipeVersionView[];
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onCreated: (schedule: ScheduleView) => void;
}

function focusFirstError(found: ScheduleErrors): void {
  const first = scheduleFieldOrder.find((field) => found[field] !== undefined);
  if (first !== undefined) document.getElementById(scheduleFieldIds[first])?.focus();
}

/**
 * The body of "Novo agendamento" (SPEC 0006 sections 5.5 and 5.7). Mounted only while the dialog is
 * open, so "today" and the default zone are read in the browser when the owner opens it. The
 * pinned recipe version, the recurrence, the brief queue and the explicit cost consent; the
 * consent resets whenever a figure it covers changes.
 */
export function ScheduleCreateForm({ formId, recipes, pending, onPendingChange, onCreated }: ScheduleCreateFormProps): ReactElement {
  const [openedAt] = useState(() => new Date());
  const [values, setValues] = useState<ScheduleFormValues>(() =>
    initialScheduleValues({
      recipeRef: recipes[0]?.ref ?? '',
      today: localTodayIso(openedAt),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  );
  const [zoneOptions] = useState(() => timeZoneOptions(values.timezone));
  const [queue, setQueue] = useState<readonly QueuedBrief[]>([]);
  const [consented, setConsented] = useState(false);
  const [errors, setErrors] = useState<ScheduleErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const recipe = recipes.find((view) => view.ref === values.recipeRef);
  const recurrence = buildRecurrence(values, openedAt);
  const figures = recipe === undefined ? null : costFigures(recipe.recipe, recurrence, openedAt);

  function update(patch: Partial<ScheduleFormValues>): void {
    setValues((previous) => ({ ...previous, ...patch }));
    if (patch.title === undefined) setConsented(false);
  }

  function chooseRecipe(ref: string): void {
    update({ recipeRef: ref });
    // Briefs take their format and language from the recipe, so a queue built for another one is dropped.
    setQueue([]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    setServerError(null);
    const found: ScheduleErrors = {};
    const titleProblem = titleError(values.title);
    if (titleProblem !== undefined) found.title = titleProblem;
    if (recipe === undefined) found.recipeRef = 'Escolha uma receita.';
    const checked = buildRecurrence(values, new Date());
    if (checked.kind === 'invalid') Object.assign(found, checked.errors);
    if (queue.length === 0) found.briefs = 'Adicione pelo menos um briefing à fila.';
    if (!consented) found.consent = 'Marque a confirmação para aceitar os custos máximos.';
    if (Object.keys(found).length > 0 || recipe === undefined || checked.kind === 'invalid' || figures === null) {
      setErrors(found);
      focusFirstError(found);
      return;
    }
    setErrors({});
    onPendingChange(true);
    try {
      const schedule = await browserSchedulesApi.createSchedule({
        title: values.title.trim(),
        recipeRef: recipe.ref,
        recurrence: checked.recurrence,
        timezone: checked.timezone,
        briefMode: 'queue',
        briefs: queue.map((entry) => ({ brief: entry.brief, references: [], ...(entry.title === null ? {} : { title: entry.title }) })),
        acceptedWorstCasePerRunUsd: figures.perRunUsd,
      });
      onCreated(schedule);
    } catch (error) {
      setServerError(describeApiError(error));
      onPendingChange(false);
    }
  }

  const recipeOptions = recipes.map((view) => ({
    value: view.ref,
    label: `${view.recipe.name} · v${view.recipe.version} · ${assetStatusLabels[view.recipe.status]}`,
  }));

  return (
    <form id={formId} className={layout.stackLarge} onSubmit={(event) => void handleSubmit(event)} noValidate>
      {serverError !== null && <Alert variant="error">{serverError}</Alert>}
      <section className={layout.stack} aria-labelledby={`${formId}-o-que`}>
        <h3 id={`${formId}-o-que`} className={styles.sectionHeading}>
          O que roda
        </h3>
        <FormField id={scheduleFieldIds.title} label="Nome do agendamento" error={errors.title} disabled={pending}>
          {({ invalid, ...control }) => (
            <Input
              {...control}
              invalid={invalid}
              maxLength={scheduleBounds.titleChars}
              value={values.title}
              onChange={(event) => update({ title: event.currentTarget.value })}
            />
          )}
        </FormField>
        <FormField
          id={scheduleFieldIds.recipeRef}
          label="Receita"
          help="A versão escolhida fica fixa no agendamento. Para usar outra versão, crie outro agendamento."
          error={errors.recipeRef}
          disabled={pending}
        >
          {({ invalid, ...control }) => (
            <Select {...control} invalid={invalid} options={recipeOptions} value={values.recipeRef} onChange={(event) => chooseRecipe(event.currentTarget.value)} />
          )}
        </FormField>
      </section>
      <section className={layout.stack} aria-labelledby={`${formId}-quando`}>
        <h3 id={`${formId}-quando`} className={styles.sectionHeading}>
          Quando
        </h3>
        <ScheduleRecurrenceFields values={values} errors={errors} disabled={pending} zoneOptions={zoneOptions} onChange={update} />
      </section>
      {recipe !== undefined && (
        <section className={layout.stack} aria-labelledby={`${formId}-briefings`}>
          <h3 id={`${formId}-briefings`} className={styles.sectionHeading}>
            Briefings
          </h3>
          <ScheduleBriefQueueEditor key={recipe.ref} recipe={recipe} queue={queue} error={errors.briefs} disabled={pending} onQueueChange={setQueue} />
        </section>
      )}
      {figures !== null && (
        <section className={layout.stack} aria-labelledby={`${formId}-custo`}>
          <h3 id={`${formId}-custo`} className={styles.sectionHeading}>
            Custo
          </h3>
          <ScheduleCostConsent figures={figures} consented={consented} error={errors.consent} disabled={pending} onConsentChange={setConsented} />
        </section>
      )}
    </form>
  );
}
