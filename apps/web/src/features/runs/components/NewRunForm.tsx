'use client';

import { Alert, Button, Card, FormField, Select, buttonClassName, useI18n } from '@studio/ui';
import { type RecipeVersionView } from '@studio/shared/api';
import { BRIEF_INSTRUCTIONS_MAX, type CompositionConflict } from '@studio/shared/recipes';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react';
import { runReferencesFromCart } from '@/features/cart/cart-bindings';
import { cartInstructionsActions } from '@/features/cart/cart-instructions-store';
import { checkoutSourceUrlFrom, checkoutSourceUrlText } from '@/features/cart/cart-source-url';
import { CART_QUERY, cartActions } from '@/features/cart/cart-store';
import layout from '@/features/common/layout.module.css';
import { CompositionConflictList } from '@/features/common/components/CompositionConflictList';
import { conflictsOfApiError } from '@/features/common/composition-conflict-text';
import { useWebMessages } from '@/lib/i18n/client';
import { newRunConflicts, type TemplateDetailsByRef } from '../run-composition';
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
import { RunInstructionsField } from './RunInstructionsField';
import { MAX_RUN_REFERENCES, RunReferencesPicker } from './RunReferencesPicker';

interface NewRunFormProps {
  /** Runnable recipe versions (draft or active), newest first per recipe. */
  recipes: readonly RecipeVersionView[];
  /** `?receita=` when it names one of `recipes`. */
  preselectedRef: string | null;
  /** Details of the templates `recipes` pin, to check the target duration before the run is created. */
  templates: TemplateDetailsByRef;
}

const CONFLICT_LIST_ID = 'execucao-conflitos';

/**
 * design/telas/07 "Nova execução": recipe version, the brief its `inputs` ask for, optional
 * run references; then `POST /runs` (draft) and `POST /runs/:runId/start` (pending), both C10.
 */
export function NewRunForm({ recipes, preselectedRef, templates }: NewRunFormProps): ReactElement {
  const router = useRouter();
  const t = useWebMessages();
  const { ui } = useI18n();
  const texts = t.runs.newRun;
  const [values, setValues] = useState<NewRunFormValues>(() =>
    initialValues(recipes.find((view) => view.ref === preselectedRef) ?? recipes[0]),
  );
  const [references, setReferences] = useState<string[]>([]);
  // Kept apart from NewRunFormValues, which the comparison and schedule forms share.
  const [instructions, setInstructions] = useState('');
  const [instructionsFromCart, setInstructionsFromCart] = useState(false);
  // The site carried from checkout; the notice shows while the field still holds it.
  const [sourceUrlFromCart, setSourceUrlFromCart] = useState<string | null>(null);
  const [errors, setErrors] = useState<NewRunErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // From a 422 `composition-conflict` on create; cleared by the next edit.
  const [serverConflicts, setServerConflicts] = useState<readonly CompositionConflict[]>([]);

  const selected = recipes.find((view) => view.ref === values.recipeRef);
  const conflicts = [...(selected === undefined ? [] : newRunConflicts(selected.recipe, templates, values.targetDurationSec)), ...serverConflicts];
  const searchParams = useSearchParams();
  const [cartReferencesAdded, setCartReferencesAdded] = useState(0);
  const cartReadRef = useRef(false);

  // Cart items the recipe does not pin become references on every arrival, so an image in the cart
  // is never left out of the run. `?carrinho=1` (after "save and create video") also carries the
  // instructions and the site written at checkout.
  useEffect(() => {
    if (cartReadRef.current) return;
    cartReadRef.current = true;
    if (searchParams.get(CART_QUERY) === '1') {
      const checkoutInstructions = cartInstructionsActions.snapshot();
      if (checkoutInstructions !== '') {
        setInstructions(checkoutInstructions);
        setInstructionsFromCart(true);
      }
      const checkoutSourceUrl = checkoutSourceUrlFrom(checkoutSourceUrlText(cartInstructionsActions.sourceUrlSnapshot(), cartActions.snapshot()));
      if (checkoutSourceUrl !== null) {
        setValues((previous) => (previous.sourceUrl.trim() === '' ? { ...previous, sourceUrl: checkoutSourceUrl } : previous));
        setSourceUrlFromCart(checkoutSourceUrl);
      }
    }
    const pinned = new Set((selected?.recipe.bindings ?? []).map((binding) => binding.ref));
    const fromCart = runReferencesFromCart(cartActions.snapshot(), pinned).slice(0, MAX_RUN_REFERENCES);
    if (fromCart.length === 0) return;
    setReferences(fromCart);
    setCartReferencesAdded(fromCart.length);
  }, [searchParams, selected]);

  function update(field: NewRunField, value: string): void {
    setServerConflicts([]);
    setValues((previous) => ({ ...previous, [field]: value }));
  }

  function chooseRecipe(ref: string): void {
    const next = recipes.find((view) => view.ref === ref);
    setServerConflicts([]);
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
    // Enter in a field submits too; a run that cannot make a video is never created.
    if (pending || conflicts.length > 0) return;
    setServerError(null);
    if (selected === undefined) {
      const found = { recipeRef: t.runs.brief.errors.recipeRequired };
      setErrors(found);
      focusFirstError(found);
      return;
    }
    const result = buildBrief(values, selected.recipe, t.runs.brief.errors);
    if (result.kind === 'invalid') {
      setErrors(result.errors);
      focusFirstError(result.errors);
      return;
    }
    setErrors({});
    setPending(true);
    const ownerInstructions = instructions.trim().slice(0, BRIEF_INSTRUCTIONS_MAX);
    let runId: string;
    try {
      const draft = await browserRunsApi.createRun({
        recipeRef: selected.ref,
        brief: ownerInstructions === '' ? result.brief : { ...result.brief, instructions: ownerInstructions },
        references: references.length === 0 ? undefined : references,
      });
      runId = draft.run.runId;
    } catch (error) {
      setServerConflicts(conflictsOfApiError(error));
      setServerError(describeRunError(error, t));
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
    label: `${view.recipe.name} · v${view.recipe.version} · ${ui.status.asset[view.recipe.status]}`,
  }));

  return (
    <form className={layout.form} onSubmit={(event) => void handleSubmit(event)} noValidate>
      {serverError !== null && <Alert variant="error">{serverError}</Alert>}
      <Card title={texts.recipeCard}>
        <FormField id={newRunFieldIds.recipeRef} label={texts.recipeLabel} error={errors.recipeRef} disabled={pending}>
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
      <Card title={texts.briefCard}>
        {sourceUrlFromCart !== null && values.sourceUrl === sourceUrlFromCart && <Alert variant="info">{t.cart.run.siteAdded}</Alert>}
        <RunBriefFields values={values} errors={errors} recipe={selected?.recipe} disabled={pending} onChange={update} />
      </Card>
      <Card title={t.runs.instructions.card}>
        {instructionsFromCart && <Alert variant="info">{t.runs.instructions.fromCart}</Alert>}
        <RunInstructionsField id="nova-execucao-instrucoes" value={instructions} onChange={setInstructions} disabled={pending} />
      </Card>
      <Card title={texts.referencesCard} description={texts.referencesDescription}>
        {cartReferencesAdded > 0 && <Alert variant="info">{t.cart.run.referencesAdded(cartReferencesAdded)}</Alert>}
        <RunReferencesPicker selected={references} onChange={setReferences} disabled={pending} />
      </Card>
      <CompositionConflictList conflicts={conflicts} id={CONFLICT_LIST_ID} />
      <div className={layout.formFooter}>
        <Link href="/execucoes" className={buttonClassName({ variant: 'secondary' })}>
          {texts.cancel}
        </Link>
        <Button
          type="submit"
          variant="primary"
          loading={pending}
          loadingLabel={texts.starting}
          disabled={conflicts.length > 0}
          aria-describedby={conflicts.length > 0 ? CONFLICT_LIST_ID : undefined}
        >
          {texts.start}
        </Button>
      </div>
    </form>
  );
}
