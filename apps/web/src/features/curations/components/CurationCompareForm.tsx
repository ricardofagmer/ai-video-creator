'use client';

import { Alert, Button, Card, FormField, Input, Select } from '@studio/ui';
import { type CuratableKind } from '@studio/shared/curation';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactElement } from 'react';
import { assetStatusLabels } from '@/features/catalog/catalog-labels';
import { describeApiError } from '@/features/common/api-error-text';
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
    if (needsSlot && slot === '') errors.slot = 'Escolha o vínculo em que a versão B entra.';
    if (trimmedTitle.length > TITLE_MAX_CHARS) errors.title = `Use até ${TITLE_MAX_CHARS} caracteres.`;
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
      setBriefErrors({ recipeRef: 'Escolha uma receita.' });
      document.getElementById(newRunFieldIds.recipeRef)?.focus();
      return;
    }
    const trimmedTitle = title.trim();
    const brief = buildBrief(values, selected.recipe.recipe);
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
      setServerError(describeApiError(error));
      setPending(false);
    }
  }

  const recipeOptions = options.map((option) => ({
    value: option.recipe.ref,
    label: `${option.recipe.recipe.name} · v${option.recipe.recipe.version} · ${assetStatusLabels[option.recipe.recipe.status]}`,
  }));

  return (
    <form className={layout.form} onSubmit={(event) => void handleSubmit(event)} noValidate>
      {serverError !== null && <Alert variant="error">{serverError}</Alert>}
      <Card title="Versão A" description="A receita como está salva. As duas execuções usam o mesmo briefing e as mesmas referências.">
        <div className={layout.stack}>
          <FormField id={newRunFieldIds.recipeRef} label="Receita" error={briefErrors.recipeRef} disabled={pending || subjectKind === 'recipe'}>
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
            <FormField id={SLOT_ID} label="Vínculo" help="O vínculo desta receita que usa a versão atual." error={choiceErrors.slot} disabled={pending}>
              {({ invalid, ...control }) => (
                <Select
                  {...control}
                  invalid={invalid}
                  placeholder="Selecione o vínculo…"
                  options={selected?.slots ?? []}
                  value={slot}
                  onChange={(event) => setSlot(event.currentTarget.value)}
                />
              )}
            </FormField>
          )}
        </div>
      </Card>
      <Card title="Versão B" description="A versão salva da proposta do curador. Só ela muda em relação à versão A.">
        <p className={styles.plainText}>
          <span className="mono">{savedRef}</span> (rascunho)
        </p>
      </Card>
      <Card title="Briefing">
        <RunBriefFields values={values} errors={briefErrors} recipe={selected?.recipe.recipe} disabled={pending} onChange={updateBrief} />
      </Card>
      <Card title="Referências" description="Ativos do catálogo usados nas duas execuções. Opcional.">
        <RunReferencesPicker selected={references} onChange={setReferences} disabled={pending} />
      </Card>
      <FormField id={TITLE_ID} label="Título" optional help="Sem título, o serviço local escolhe um." error={choiceErrors.title} disabled={pending}>
        {({ invalid, ...control }) => (
          <Input {...control} invalid={invalid} maxLength={TITLE_MAX_CHARS} value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
        )}
      </FormField>
      <p className="caption">Criar a comparação não gasta nada: as duas execuções ficam em rascunho até você aceitar o custo máximo do par.</p>
      <div className={layout.formFooter}>
        <Button type="submit" variant="primary" loading={pending} loadingLabel="Criando…">
          Comparar
        </Button>
      </div>
    </form>
  );
}
