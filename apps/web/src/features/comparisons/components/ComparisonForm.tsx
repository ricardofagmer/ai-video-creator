'use client';

import { Alert, Button, Card, FormField, Select, buttonClassName, useI18n } from '@studio/ui';
import { type RecipeVersionView } from '@studio/shared/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent, type ReactElement } from 'react';
import { describeApiError } from '@/features/common/api-error-text';
import { useWebMessages } from '@/lib/i18n/client';
import layout from '@/features/common/layout.module.css';
import { RunBriefFields } from '@/features/runs/components/RunBriefFields';
import { RunReferencesPicker } from '@/features/runs/components/RunReferencesPicker';
import {
  buildBrief,
  defaultTargetDuration,
  initialValues,
  newRunFieldIds,
  newRunFieldOrder,
  type NewRunErrors,
  type NewRunField,
  type NewRunFormValues,
} from '@/features/runs/new-run-model';
import { ApiRequestError, browserStudioClient } from '@/lib/api';
import {
  bindingSlotOptions,
  boundAsset,
  buildSubject,
  candidateAssetVersions,
  comparisonFieldIds,
  emptyChoice,
  otherRecipeVersions,
  type ComparisonChoice,
  type ComparisonChoiceErrors,
  type ComparisonChoiceField,
  type ComparisonKind,
} from '../comparison-form-model';
import { browserComparisonsApi } from '../comparisons-api';
import { ComparisonSubjectFields, type CandidateVersions } from './ComparisonSubjectFields';

interface ComparisonFormProps {
  /** Runnable recipe versions (draft or active) for arm A. */
  recipes: readonly RecipeVersionView[];
}

const subjectReasons = new Set(['comparison-subject-invalid', 'comparison-biometric-refused']);

const subjectFieldOrder: readonly ComparisonChoiceField[] = ['slot', 'assetRef', 'recipeRef', 'title'];

/**
 * "Nova comparação" (SPEC 0003 section 5.3): arm A is a recipe version; arm B changes one thing,
 * a bound asset's version or the recipe's version. Both runs share the brief and the references.
 * `POST /comparisons` saves two `draft` runs and spends nothing; the comparison page starts them.
 */
export function ComparisonForm({ recipes }: ComparisonFormProps): ReactElement {
  const t = useWebMessages();
  const { ui } = useI18n();
  const texts = t.curations.compareForm;
  const formTexts = t.curations.comparisons.form;
  const router = useRouter();
  const [values, setValues] = useState<NewRunFormValues>(() => initialValues(recipes[0]));
  const [choice, setChoice] = useState<ComparisonChoice>(emptyChoice);
  const [references, setReferences] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<CandidateVersions>({ status: 'idle' });
  const [briefErrors, setBriefErrors] = useState<NewRunErrors>({});
  const [choiceErrors, setChoiceErrors] = useState<ComparisonChoiceErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // A slot read that finishes after the owner picked another slot or recipe is ignored.
  const candidateRequest = useRef(0);

  const selected = recipes.find((view) => view.ref === values.recipeRef);

  function chooseRecipe(ref: string): void {
    const next = recipes.find((view) => view.ref === ref);
    setValues((previous) => ({
      ...previous,
      recipeRef: ref,
      targetDurationSec: next === undefined ? previous.targetDurationSec : defaultTargetDuration(next.recipe),
    }));
    candidateRequest.current += 1;
    setCandidates({ status: 'idle' });
    setChoice((previous) => ({ ...previous, slot: '', assetRef: '', recipeRef: '' }));
  }

  async function chooseSlot(slot: string): Promise<void> {
    setChoice((previous) => ({ ...previous, slot, assetRef: '' }));
    candidateRequest.current += 1;
    const request = candidateRequest.current;
    const bound = selected === undefined ? null : boundAsset(selected.recipe, slot);
    if (bound === null) {
      setCandidates({ status: 'idle' });
      return;
    }
    setCandidates({ status: 'loading' });
    try {
      const page = await browserStudioClient.listAssetVersions(bound.assetId, { limit: 100 });
      if (request === candidateRequest.current) setCandidates({ status: 'ready', options: candidateAssetVersions(page.items, bound.ref) });
    } catch (error) {
      if (request === candidateRequest.current) setCandidates({ status: 'failed', message: describeApiError(error, t) });
    }
  }

  function chooseKind(kind: ComparisonKind): void {
    setChoice((previous) => ({ ...previous, kind }));
  }

  function updateChoice(field: Exclude<ComparisonChoiceField, 'slot'>, value: string): void {
    setChoice((previous) => ({ ...previous, [field]: value }));
  }

  function updateBrief(field: NewRunField, value: string): void {
    setValues((previous) => ({ ...previous, [field]: value }));
  }

  function focusFirstError(brief: NewRunErrors, subject: ComparisonChoiceErrors): void {
    const briefField = newRunFieldOrder.find((field) => brief[field] !== undefined);
    if (briefField !== undefined) {
      document.getElementById(newRunFieldIds[briefField])?.focus();
      return;
    }
    const subjectField = subjectFieldOrder.find((field) => subject[field] !== undefined);
    if (subjectField !== undefined) document.getElementById(comparisonFieldIds[subjectField])?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    setServerError(null);
    if (selected === undefined) {
      setBriefErrors({ recipeRef: formTexts.recipeRequired });
      document.getElementById(newRunFieldIds.recipeRef)?.focus();
      return;
    }
    const brief = buildBrief(values, selected.recipe, t.runs.brief.errors);
    const subject = buildSubject(choice, t.curations.comparisons.errors);
    const foundBrief = brief.kind === 'invalid' ? brief.errors : {};
    const foundSubject = subject.kind === 'invalid' ? subject.errors : {};
    setBriefErrors(foundBrief);
    setChoiceErrors(foundSubject);
    if (brief.kind === 'invalid' || subject.kind === 'invalid') {
      focusFirstError(foundBrief, foundSubject);
      return;
    }
    setPending(true);
    try {
      const comparison = await browserComparisonsApi.createComparison({
        recipeRef: selected.ref,
        brief: brief.brief,
        references: references.length === 0 ? undefined : references,
        title: subject.title,
        subject: subject.subject,
      });
      router.push(`/comparacoes/${encodeURIComponent(comparison.comparisonId)}`);
    } catch (error) {
      const message = describeApiError(error, t);
      if (error instanceof ApiRequestError && error.reason !== null && subjectReasons.has(error.reason)) {
        const onAsset = choice.kind === 'asset-binding';
        setChoiceErrors(onAsset ? { assetRef: message } : { recipeRef: message });
        document.getElementById(comparisonFieldIds[onAsset ? 'assetRef' : 'recipeRef'])?.focus();
      } else {
        setServerError(message);
      }
      setPending(false);
    }
  }

  const recipeOptions = recipes.map((view) => ({
    value: view.ref,
    label: `${view.recipe.name} · v${view.recipe.version} · ${ui.status.asset[view.recipe.status]}`,
  }));

  return (
    <form className={layout.form} onSubmit={(event) => void handleSubmit(event)} noValidate>
      {serverError !== null && <Alert variant="error">{serverError}</Alert>}
      <Card title={texts.armA} description={texts.armADescription}>
        <FormField id={newRunFieldIds.recipeRef} label={texts.recipe} error={briefErrors.recipeRef} disabled={pending}>
          {({ invalid, ...control }) => (
            <Select {...control} invalid={invalid} options={recipeOptions} value={values.recipeRef} onChange={(event) => chooseRecipe(event.currentTarget.value)} />
          )}
        </FormField>
      </Card>
      <Card title={texts.armB} description={formTexts.armBDescription}>
        <ComparisonSubjectFields
          choice={choice}
          errors={choiceErrors}
          slotOptions={selected === undefined ? [] : bindingSlotOptions(selected.recipe, t.recipes.bindings.slots)}
          candidates={candidates}
          recipeVersionOptions={selected === undefined ? [] : otherRecipeVersions(recipes, selected)}
          disabled={pending}
          onKindChange={chooseKind}
          onSlotChange={(slot) => void chooseSlot(slot)}
          onChange={updateChoice}
        />
      </Card>
      <Card title={texts.brief}>
        <RunBriefFields values={values} errors={briefErrors} recipe={selected?.recipe} disabled={pending} onChange={updateBrief} />
      </Card>
      <Card title={texts.references} description={texts.referencesDescription}>
        <RunReferencesPicker selected={references} onChange={setReferences} disabled={pending} />
      </Card>
      <p className="caption">{texts.noSpend}</p>
      <div className={layout.formFooter}>
        <Link href="/comparacoes" className={buttonClassName({ variant: 'secondary' })}>
          {formTexts.cancel}
        </Link>
        <Button type="submit" variant="primary" loading={pending} loadingLabel={texts.creating}>
          {formTexts.create}
        </Button>
      </div>
    </form>
  );
}
