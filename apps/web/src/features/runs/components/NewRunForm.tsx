'use client';

import { Alert, Button, Card, FormField, Select, buttonClassName } from '@studio/ui';
import { type RecipeVersionView } from '@studio/shared/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { assetStatusLabels } from '@/features/catalog/catalog-labels';
import { describeRunError } from '../run-error-text';
import { browserRunsApi } from '../runs-api';
import {
  buildBrief,
  defaultTargetDuration,
  initialValues,
  newRunFieldIds,
  newRunFieldOrder,
  type NewRunErrors,
  type NewRunField,
  type NewRunFormValues,
} from '../new-run-model';
import { RunBriefFields } from './RunBriefFields';
import { RunReferencesPicker } from './RunReferencesPicker';

interface NewRunFormProps {
  /** Runnable recipe versions (draft or active), newest first per recipe. */
  recipes: readonly RecipeVersionView[];
  /** `?receita=` when it names one of `recipes`. */
  preselectedRef: string | null;
}

/**
 * design/telas/07 "Nova execução": recipe version, the brief its `inputs` ask for, optional
 * run references; then `POST /runs` (draft) and `POST /runs/:runId/start` (pending), both C10.
 */
export function NewRunForm({ recipes, preselectedRef }: NewRunFormProps): ReactElement {
  const router = useRouter();
  const [values, setValues] = useState<NewRunFormValues>(() =>
    initialValues(recipes.find((view) => view.ref === preselectedRef) ?? recipes[0]),
  );
  const [references, setReferences] = useState<string[]>([]);
  const [errors, setErrors] = useState<NewRunErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const selected = recipes.find((view) => view.ref === values.recipeRef);

  function update(field: NewRunField, value: string): void {
    setValues((previous) => ({ ...previous, [field]: value }));
  }

  function chooseRecipe(ref: string): void {
    const next = recipes.find((view) => view.ref === ref);
    setValues((previous) => ({
      ...previous,
      recipeRef: ref,
      targetDurationSec: next === undefined ? previous.targetDurationSec : defaultTargetDuration(next.recipe),
    }));
  }

  function focusFirstError(found: NewRunErrors): void {
    const first = newRunFieldOrder.find((field) => found[field] !== undefined);
    if (first !== undefined) document.getElementById(newRunFieldIds[first])?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    setServerError(null);
    if (selected === undefined) {
      const found = { recipeRef: 'Escolha uma receita.' };
      setErrors(found);
      focusFirstError(found);
      return;
    }
    const result = buildBrief(values, selected.recipe);
    if (result.kind === 'invalid') {
      setErrors(result.errors);
      focusFirstError(result.errors);
      return;
    }
    setErrors({});
    setPending(true);
    let runId: string;
    try {
      const draft = await browserRunsApi.createRun({
        recipeRef: selected.ref,
        brief: result.brief,
        references: references.length === 0 ? undefined : references,
      });
      runId = draft.run.runId;
    } catch (error) {
      setServerError(describeRunError(error));
      setPending(false);
      return;
    }
    try {
      await browserRunsApi.startRun(runId);
      router.push(`/execucoes/${runId}`);
    } catch {
      // The draft exists; its page offers "Iniciar execução" again with the failure notice.
      router.push(`/execucoes/${runId}?aviso=inicio-falhou`);
    }
  }

  const recipeOptions = recipes.map((view) => ({
    value: view.ref,
    label: `${view.recipe.name} · v${view.recipe.version} · ${assetStatusLabels[view.recipe.status]}`,
  }));

  return (
    <form className={layout.form} onSubmit={(event) => void handleSubmit(event)} noValidate>
      {serverError !== null && <Alert variant="error">{serverError}</Alert>}
      <Card title="Receita">
        <FormField id={newRunFieldIds.recipeRef} label="Receita" error={errors.recipeRef} disabled={pending}>
          {({ invalid, ...control }) => (
            <Select
              {...control}
              invalid={invalid}
              options={recipeOptions}
              value={values.recipeRef}
              onChange={(event) => chooseRecipe(event.currentTarget.value)}
            />
          )}
        </FormField>
      </Card>
      <Card title="Briefing">
        <RunBriefFields values={values} errors={errors} recipe={selected?.recipe} disabled={pending} onChange={update} />
      </Card>
      <Card title="Referências desta execução" description="Ativos do catálogo usados só nesta execução. Opcional.">
        <RunReferencesPicker selected={references} onChange={setReferences} disabled={pending} />
      </Card>
      <div className={layout.formFooter}>
        <Link href="/execucoes" className={buttonClassName({ variant: 'secondary' })}>
          Cancelar
        </Link>
        <Button type="submit" variant="primary" loading={pending} loadingLabel="Iniciando…">
          Iniciar execução
        </Button>
      </div>
    </form>
  );
}
