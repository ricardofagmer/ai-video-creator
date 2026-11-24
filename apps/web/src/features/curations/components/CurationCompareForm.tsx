'use client';

import { Alert, Button, Card, FormField, Input, Select, useI18n } from '@studio/ui';
import { type CuratableKind } from '@studio/shared/curation';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactElement } from 'react';
import { describeApiError } from '@/features/common/api-error-text';
import { useWebMessages } from '@/lib/i18n/client';
import layout from '@/features/common/layout.module.css';
import { TITLE_MAX_CHARS } from '@/features/comparisons/comparison-form-model';
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
import { type CompareArmOption } from '../curation-compare-model';
import { browserCurationsApi } from '../curations-api';
import styles from '../curations.module.css';

interface CurationCompareFormProps {
  curationId: string;
  subjectKind: CuratableKind;
  /** The draft saved from the proposal: arm B, fixed. */
  savedRef: string;
  options: readonly CompareArmOption[];
}

const SLOT_ID = 'curadoria-comparacao-vinculo';
const TITLE_ID = 'curadoria-comparacao-titulo';

/** The slot to preselect: the only one when the recipe binds the subject's asset once. */
function onlySlot(option: CompareArmOption | undefined): string {
  const slots = option?.slots ?? [];
  return slots.length === 1 ? (slots[0]?.value ?? '') : '';
}

interface ChoiceErrors {
  slot?: string;
  title?: string;
}

/**
 * "Comparar" on the curation page (SPEC 0005 section 5.9, B15, C5-AC-18): the "Nova comparação"
 * fields with arm B fixed to the saved draft. Arm A is a recipe version; for a prompt or skill it
 * is a recipe that binds the subject's asset, and the owner picks that slot. `compare` creates the
 * comparison and starts nothing; the comparison page asks for the pair's cost before starting.
 */
export function CurationCompareForm({ curationId, subjectKind, savedRef, options }: CurationCompareFormProps): ReactElement {
  const t = useWebMessages();
  const { ui } = useI18n();
  const texts = t.curations.compareForm;
  const router = useRouter();
  const [values, setValues] = useState<NewRunFormValues>(() => initialValues(options[0]?.recipe));
  const [slot, setSlot] = useState(() => onlySlot(options[0]));
  const [title, setTitle] = useState('');
  const [references, setReferences] = useState<string[]>([]);
  const [briefErrors, setBriefErrors] = useState<NewRunErrors>({});
  const [choiceErrors, setChoiceErrors] = useState<ChoiceErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const needsSlot = subjectKind !== 'recipe';
  const selected = options.find((option) => option.recipe.ref === values.recipeRef);

  function chooseRecipe(ref: string): void {
    const next = options.find((option) => option.recipe.ref === ref);
    setValues((previous) => ({
      ...previous,
      recipeRef: ref,
      targetDurationSec: next === undefined ? previous.targetDurationSec : defaultTargetDuration(next.recipe.recipe),
    }));
    setSlot(onlySlot(next));
  }

  function updateBrief(field: NewRunField, value: string): void {
    setValues((previous) => ({ ...previous, [field]: value }));
  }

  function choiceErrorsFor(trimmedTitle: string): ChoiceErrors {
    const errors: ChoiceErrors = {};
    if (needsSlot && slot === '') errors.slot = texts.slotRequired;
    if (trimmedTitle.length > TITLE_MAX_CHARS) errors.title = texts.titleTooLong(TITLE_MAX_CHARS);
    return errors;
  }

  function focusFirstError(brief: NewRunErrors, choice: ChoiceErrors): void {
    const briefField = newRunFieldOrder.find((field) => brief[field] !== undefined);
    if (briefField !== undefined) {
      document.getElementById(newRunFieldIds[briefField])?.focus();
      return;
    }
    if (choice.slot !== undefined) document.getElementById(SLOT_ID)?.focus();
    else if (choice.title !== undefined) document.getElementById(TITLE_ID)?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    setServerError(null);
    if (selected === undefined) {
      setBriefErrors({ recipeRef: texts.recipeRequired });
      document.getElementById(newRunFieldIds.recipeRef)?.focus();
      return;
    }
    const trimmedTitle = title.trim();
    const brief = buildBrief(values, selected.recipe.recipe, t.runs.brief.errors);
    const foundBrief = brief.kind === 'invalid' ? brief.errors : {};
    const foundChoice = choiceErrorsFor(trimmedTitle);
    setBriefErrors(foundBrief);
    setChoiceErrors(foundChoice);
    if (brief.kind === 'invalid' || Object.keys(foundChoice).length > 0) {
      focusFirstError(foundBrief, foundChoice);
      return;
    }
    setPending(true);
    try {
      const curation = await browserCurationsApi.decide(curationId, {
        action: 'compare',
        recipeRef: selected.recipe.ref,
        slot: needsSlot ? slot : undefined,
        brief: brief.brief,
        references: references.length === 0 ? undefined : references,
        title: trimmedTitle === '' ? undefined : trimmedTitle,
      });
      const comparisonId = curation.decision?.comparisonId ?? null;
      if (comparisonId === null) router.refresh();
      else router.push(`/comparacoes/${encodeURIComponent(comparisonId)}`);
    } catch (error) {
      setServerError(describeApiError(error, t));
      setPending(false);
    }
  }

  const recipeOptions = options.map((option) => ({
    value: option.recipe.ref,
    label: `${option.recipe.recipe.name} · v${option.recipe.recipe.version} · ${ui.status.asset[option.recipe.recipe.status]}`,
  }));

  return (
    <form className={layout.form} onSubmit={(event) => void handleSubmit(event)} noValidate>
      {serverError !== null && <Alert variant="error">{serverError}</Alert>}
      <Card title={texts.armA} description={texts.armADescription}>
        <div className={layout.stack}>
          <FormField id={newRunFieldIds.recipeRef} label={texts.recipe} error={briefErrors.recipeRef} disabled={pending || subjectKind === 'recipe'}>
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
          {needsSlot && (
            <FormField id={SLOT_ID} label={texts.slot} help={texts.slotHelp} error={choiceErrors.slot} disabled={pending}>
              {({ invalid, ...control }) => (
                <Select
                  {...control}
                  invalid={invalid}
                  placeholder={texts.slotPlaceholder}
                  options={selected?.slots ?? []}
                  value={slot}
                  onChange={(event) => setSlot(event.currentTarget.value)}
                />
              )}
            </FormField>
          )}
        </div>
      </Card>
      <Card title={texts.armB} description={texts.armBDescription}>
        <p className={styles.plainText}>
          <span className="mono">{savedRef}</span>
          {texts.draftSuffix}
        </p>
      </Card>
      <Card title={texts.brief}>
        <RunBriefFields values={values} errors={briefErrors} recipe={selected?.recipe.recipe} disabled={pending} onChange={updateBrief} />
      </Card>
      <Card title={texts.references} description={texts.referencesDescription}>
        <RunReferencesPicker selected={references} onChange={setReferences} disabled={pending} />
      </Card>
      <FormField id={TITLE_ID} label={texts.title} optional help={texts.titleHelp} error={choiceErrors.title} disabled={pending}>
        {({ invalid, ...control }) => (
          <Input {...control} invalid={invalid} maxLength={TITLE_MAX_CHARS} value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
        )}
      </FormField>
      <p className="caption">{texts.noSpend}</p>
      <div className={layout.formFooter}>
        <Button type="submit" variant="primary" loading={pending} loadingLabel={texts.creating}>
          {texts.compare}
        </Button>
      </div>
    </form>
  );
}
