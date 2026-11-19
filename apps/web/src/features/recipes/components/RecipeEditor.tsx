'use client';

import { Alert, Button, buttonClassName } from '@studio/ui';
import { type RecipeDefinitionInput } from '@studio/shared/api';
import { mandatoryStages, type StageId } from '@studio/shared/run-format';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactElement, useEffect, useRef, useState } from 'react';
import layout from '@/features/common/layout.module.css';
import { describeApiError } from '@/features/common/api-error-text';
import { ApiRequestError, browserStudioClient } from '@/lib/api';
import {
  buildRecipeDefinition,
  emptyRecipeForm,
  recipeFieldIds,
  recipeFieldOfPath,
  recipeFormFrom,
  recipeIdFromName,
  type BindingOption,
  type RecipeFormValues,
} from '../recipe-form-model';
import { slotsForStages } from '../recipe-slots';
import { RecipeFormatSection, RecipeIdentitySection } from './RecipeBasicsSections';
import { RecipeBindingsSection } from './RecipeBindingsSection';
import { RecipeChecklistSection } from './RecipeChecklistSection';
import { RecipeGatesSection, RecipeInputsSection, RecipeStagesSection } from './RecipeFlowSections';

/** The version the editor opened; null for `/receitas/nova`. */
export interface RecipeEditorBase {
  recipeId: string;
  version: number;
  nextVersion: number;
  definition: RecipeDefinitionInput;
}

export interface RecipeEditorProps {
  base: RecipeEditorBase | null;
  options: readonly BindingOption[];
}

function problemsText(count: number): string {
  return count === 1 ? 'Corrija 1 campo antes de salvar.' : `Corrija ${count} campos antes de salvar.`;
}

/** design/telas/06: build a recipe from catalog versions and save it as a new version. */
export function RecipeEditor({ base, options }: RecipeEditorProps): ReactElement {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<RecipeFormValues>(() => (base === null ? emptyRecipeForm() : recipeFormFrom(base.recipeId, base.definition)));
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitCount, setSubmitCount] = useState(0);
  const [dirty, setDirty] = useState(false);
  const isNew = base === null;
  const enabled = new Set<StageId>([...values.enabledStages, ...mandatoryStages]);
  const slots = slotsForStages(enabled);

  useEffect(() => {
    if (!dirty) return undefined;
    const confirmLeave = (event: BeforeUnloadEvent): void => event.preventDefault();
    window.addEventListener('beforeunload', confirmLeave);
    return () => window.removeEventListener('beforeunload', confirmLeave);
  }, [dirty]);

  useEffect(() => {
    if (submitCount === 0) return;
    const invalid = formRef.current?.querySelector<HTMLElement>(`[aria-invalid="true"], #${recipeFieldIds.stages}[aria-describedby]`);
    (invalid ?? alertRef.current)?.focus();
  }, [submitCount]);

  function update(patch: Partial<RecipeFormValues>): void {
    setDirty(true);
    setValues((current) => ({ ...current, ...patch }));
  }

  function fail(fieldErrors: Readonly<Record<string, string>>, message: string): void {
    setErrors(fieldErrors);
    setFormError(message);
    setSubmitCount((count) => count + 1);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    const built = buildRecipeDefinition(values, options, isNew);
    if (!built.ok) {
      fail(built.errors, problemsText(Object.keys(built.errors).length));
      return;
    }
    setSubmitting(true);
    setErrors({});
    setFormError(null);
    try {
      const saved =
        base === null
          ? await browserStudioClient.createRecipe({ recipeId: values.recipeId, definition: built.definition })
          : await browserStudioClient.saveRecipeVersion(base.recipeId, { definition: built.definition });
      setDirty(false);
      router.push(`/receitas/${saved.recipe.id}?versao=${saved.recipe.version}&aviso=salvo`);
    } catch (error) {
      setSubmitting(false);
      const fieldErrors: Record<string, string> = {};
      if (error instanceof ApiRequestError) {
        if (error.reason === 'recipe-already-exists') fieldErrors[recipeFieldIds.recipeId] = describeApiError(error);
        for (const issue of error.issues) {
          const fieldId = recipeFieldOfPath(issue.path);
          if (fieldId !== null) fieldErrors[fieldId] ??= 'Valor inválido.';
        }
      }
      fail(fieldErrors, `Não foi possível salvar. ${describeApiError(error)}`);
    }
  }

  const cancelHref = base === null ? '/receitas' : `/receitas/${base.recipeId}?versao=${base.version}`;

  return (
    <form ref={formRef} className={layout.formWide} noValidate aria-busy={submitting} onSubmit={(event) => void submit(event)}>
      {formError !== null && (
        <div ref={alertRef} tabIndex={-1}>
          <Alert variant="error">{formError}</Alert>
        </div>
      )}
      <fieldset className={`${layout.fieldset} ${layout.formWide}`} disabled={submitting}>
        <legend className="visually-hidden">Receita</legend>
        <RecipeIdentitySection
          values={values}
          isNew={isNew}
          errors={errors}
          onNameChange={(name) => update(isNew && !values.recipeIdEdited ? { name, recipeId: recipeIdFromName(name) } : { name })}
          onChange={update}
        />
        <RecipeFormatSection values={values} errors={errors} onChange={update} />
        <RecipeStagesSection enabledStages={values.enabledStages} error={errors[recipeFieldIds.stages]} onChange={(enabledStages) => update({ enabledStages })} />
        <RecipeBindingsSection
          slots={slots}
          options={options}
          bindings={values.bindings}
          errors={errors}
          onChange={(slot, ref) => update({ bindings: { ...values.bindings, [slot]: ref } })}
        />
        <RecipeGatesSection scriptApproval={values.scriptApproval} scriptEnabled={enabled.has('script')} onChange={(scriptApproval) => update({ scriptApproval })} />
        <RecipeInputsSection values={values} onChange={update} />
        <RecipeChecklistSection items={values.checklist} onChange={(checklist) => update({ checklist })} />
      </fieldset>
      <div className={layout.formFooter}>
        <Link href={cancelHref} className={buttonClassName({ variant: 'secondary' })}>
          Cancelar
        </Link>
        <Button type="submit" loading={submitting} loadingLabel="Salvando…">
          {base === null ? 'Salvar receita' : `Salvar como versão ${base.nextVersion}`}
        </Button>
      </div>
    </form>
  );
}
