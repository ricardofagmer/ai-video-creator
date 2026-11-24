'use client';

import { Alert, Button, buttonClassName } from '@studio/ui';
import { type RecipeDefinitionInput } from '@studio/shared/api';
import { type CompositionConflict } from '@studio/shared/recipes';
import { mandatoryStages, type StageId } from '@studio/shared/run-format';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, type ReactElement, useEffect, useRef, useState } from 'react';
import { fillSlotsFromCart } from '@/features/cart/cart-bindings';
import { CART_QUERY, cartActions, useCart } from '@/features/cart/cart-store';
import layout from '@/features/common/layout.module.css';
import { describeApiError } from '@/features/common/api-error-text';
import { CompositionConflictList } from '@/features/common/components/CompositionConflictList';
import { conflictsOfApiError } from '@/features/common/composition-conflict-text';
import { useWebMessages } from '@/lib/i18n/client';
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
import { recipeFormConflicts } from '../recipe-composition';
import { slotsForStages } from '../recipe-slots';
import { RecipeFormatSection, RecipeIdentitySection } from './RecipeBasicsSections';
import { RecipeBindingsSection } from './RecipeBindingsSection';
import { RecipeChecklistSection } from './RecipeChecklistSection';
import { RecipeWriterSkillsSection } from './RecipeWriterSkillsSection';
import { RecipeGatesSection, RecipeInputsSection, RecipeStagesSection } from './RecipeFlowSections';
import { RecipeWizardStepper } from './RecipeWizardStepper';
import { errorsOfStep, firstStepWithErrors, recipeWizardSteps, type RecipeWizardStep } from '../recipe-wizard-steps';

/** What the last "apply cart" did, shown under the button. */
interface CartNotice {
  used: number;
  skipped: readonly string[];
  /** Cart items of non-recipe kinds; they become run references on "save and create video". */
  references: number;
  /** Cart kinds with one slot held twice: none of them was pinned. */
  conflicts: readonly CompositionConflict[];
}

const CONFLICT_LIST_ID = 'receita-conflitos';

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
  /** `/receitas/nova`: one step at a time with a stepper; otherwise every section at once. */
  wizard?: boolean;
}

/** What takes focus after the next render: the step heading, or the first invalid field. */
interface FocusRequest {
  target: 'heading' | 'invalid';
  count: number;
}

/** design/telas/06: build a recipe from catalog versions and save it as a new version. */
export function RecipeEditor({ base, options, wizard = false }: RecipeEditorProps): ReactElement {
  const t = useWebMessages();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<RecipeFormValues>(() => (base === null ? emptyRecipeForm(t.recipes.defaults) : recipeFormFrom(base.recipeId, base.definition)));
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [step, setStep] = useState<RecipeWizardStep>(recipeWizardSteps[0]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [dirty, setDirty] = useState(false);
  const [cartNotice, setCartNotice] = useState<CartNotice | null>(null);
  // From a 422 `composition-conflict` on save; cleared by the next edit.
  const [serverConflicts, setServerConflicts] = useState<readonly CompositionConflict[]>([]);
  // Set only by "save and create video"; Enter and the primary button keep the plain save.
  const createVideoAfterSaveRef = useRef(false);
  const searchParams = useSearchParams();
  const cart = useCart();
  const isNew = base === null;
  const enabled = new Set<StageId>([...values.enabledStages, ...mandatoryStages]);
  const slots = slotsForStages(enabled);
  const conflicts = [...recipeFormConflicts(values, options), ...serverConflicts];

  // `?carrinho=1` (from the navbar cart): pin the cart once the browser's cart can be read.
  const cartAppliedRef = useRef(false);
  useEffect(() => {
    if (cartAppliedRef.current || searchParams.get(CART_QUERY) !== '1') return;
    cartAppliedRef.current = true;
    applyCart();
    // applyCart reads the latest values; running once on arrival is the intent.
  }, [searchParams]);

  useEffect(() => {
    if (!dirty) return undefined;
    const confirmLeave = (event: BeforeUnloadEvent): void => event.preventDefault();
    window.addEventListener('beforeunload', confirmLeave);
    return () => window.removeEventListener('beforeunload', confirmLeave);
  }, [dirty]);

  useEffect(() => {
    if (focusRequest === null) return;
    if (focusRequest.target === 'heading') {
      headingRef.current?.focus();
      return;
    }
    const invalid = formRef.current?.querySelector<HTMLElement>(`[aria-invalid="true"], #${recipeFieldIds.stages}[aria-describedby]`);
    (invalid ?? alertRef.current)?.focus();
  }, [focusRequest]);

  function requestFocus(target: FocusRequest['target']): void {
    setFocusRequest((current) => ({ target, count: (current?.count ?? 0) + 1 }));
  }

  const stepIndex = recipeWizardSteps.indexOf(step);
  const isLastStep = !wizard || stepIndex === recipeWizardSteps.length - 1;
  const shows = (section: RecipeWizardStep): boolean => !wizard || step === section;

  function goToStep(next: RecipeWizardStep): void {
    setStep(next);
    setErrors({});
    setFormError(null);
    requestFocus('heading');
  }

  /** Avançar: only the current step's fields must be valid; later steps are checked when reached. */
  function goForward(): void {
    const built = buildRecipeDefinition(values, options, isNew, t.recipes);
    const stepErrors = built.ok ? {} : errorsOfStep(built.errors, step);
    const blocked = Object.keys(stepErrors).length;
    if (blocked > 0) {
      fail(stepErrors, t.recipes.wizard.problems(blocked));
      return;
    }
    if (step === 'bindings' && conflicts.length > 0) {
      setErrors({});
      setFormError(t.recipes.wizard.conflicts);
      requestFocus('invalid');
      return;
    }
    goToStep(recipeWizardSteps[stepIndex + 1] ?? step);
  }

  function update(patch: Partial<RecipeFormValues>): void {
    setDirty(true);
    setServerConflicts([]);
    setValues((current) => ({ ...current, ...patch }));
  }

  function applyCart(): void {
    const items = cartActions.snapshot();
    if (items.length === 0) return;
    const fill = fillSlotsFromCart(slots, items, options, values.bindings, values.writerSkills, enabled.has('script'));
    update({ bindings: fill.bindings, writerSkills: fill.writerSkills });
    setCartNotice({
      used: fill.used.length,
      skipped: fill.skipped.map((item) => item.name),
      references: items.length - fill.used.length - fill.skipped.length - fill.conflicts.flatMap((conflict) => (conflict.rule === 'duplicate-kind' ? conflict.refs : [])).length,
      conflicts: fill.conflicts,
    });
  }

  function fail(fieldErrors: Readonly<Record<string, string>>, message: string): void {
    setErrors(fieldErrors);
    setFormError(message);
    // A failed save returns the wizard to the earliest step that shows one of the errors.
    const errorStep = wizard ? firstStepWithErrors(fieldErrors) : null;
    if (errorStep !== null) setStep(errorStep);
    requestFocus('invalid');
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    // Enter in a field of an earlier wizard step moves forward instead of saving.
    if (!isLastStep) {
      goForward();
      return;
    }
    // Enter in a field submits too; a recipe that cannot make a video is never sent.
    if (submitting || conflicts.length > 0) return;
    const thenCreateVideo = createVideoAfterSaveRef.current;
    createVideoAfterSaveRef.current = false;
    const built = buildRecipeDefinition(values, options, isNew, t.recipes);
    if (!built.ok) {
      fail(built.errors, t.recipes.editor.problems(Object.keys(built.errors).length));
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
      if (thenCreateVideo) {
        router.push(`/execucoes/nova?receita=${saved.recipe.id}@${saved.recipe.version}&${CART_QUERY}=1`);
        return;
      }
      router.push(`/receitas/${saved.recipe.id}?versao=${saved.recipe.version}&aviso=salvo`);
    } catch (error) {
      setSubmitting(false);
      const fieldErrors: Record<string, string> = {};
      setServerConflicts(conflictsOfApiError(error));
      if (error instanceof ApiRequestError) {
        if (error.reason === 'recipe-already-exists') fieldErrors[recipeFieldIds.recipeId] = describeApiError(error, t);
        for (const issue of error.issues) {
          const fieldId = recipeFieldOfPath(issue.path);
          if (fieldId !== null) fieldErrors[fieldId] ??= t.recipes.errors.invalid;
        }
      }
      fail(fieldErrors, t.recipes.editor.saveFailed(describeApiError(error, t)));
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
        <legend className="visually-hidden">{t.recipes.editor.legend}</legend>
        {wizard && <RecipeWizardStepper current={step} headingRef={headingRef} />}
        {shows('identity') && (
          <RecipeIdentitySection
            values={values}
            isNew={isNew}
            errors={errors}
            onNameChange={(name) => update(isNew && !values.recipeIdEdited ? { name, recipeId: recipeIdFromName(name) } : { name })}
            onChange={update}
          />
        )}
        {shows('format') && <RecipeFormatSection values={values} errors={errors} onChange={update} />}
        {shows('stages') && (
          <RecipeStagesSection
            enabledStages={values.enabledStages}
            siteAnalysis={values.siteAnalysis}
            error={errors[recipeFieldIds.stages]}
            onChange={(enabledStages) => update({ enabledStages })}
            onSiteAnalysisChange={(siteAnalysis) => update({ siteAnalysis })}
          />
        )}
        {shows('bindings') && cart.length > 0 && (
          <div className={layout.stack}>
            <div>
              <Button type="button" variant="secondary" onClick={applyCart}>
                {t.cart.recipe.apply}
              </Button>
            </div>
            {cartNotice !== null && (
              <Alert variant="info">
                <span>{t.cart.recipe.applied(cartNotice.used)}</span>
                {cartNotice.skipped.length > 0 && <span> {t.cart.recipe.skipped(cartNotice.skipped.join(', '))}</span>}
                {cartNotice.references > 0 && <span> {t.cart.recipe.referencesLater(cartNotice.references)}</span>}
              </Alert>
            )}
            {cartNotice !== null && <CompositionConflictList conflicts={cartNotice.conflicts} />}
          </div>
        )}
        {shows('bindings') && (
          <RecipeBindingsSection
            slots={slots}
            options={options}
            bindings={values.bindings}
            errors={errors}
            onChange={(slot, ref) => update({ bindings: { ...values.bindings, [slot]: ref } })}
            language={values.language}
          />
        )}
        {shows('bindings') && enabled.has('script') && (
          <RecipeWriterSkillsSection options={options} writerSkills={values.writerSkills} onChange={(writerSkills) => update({ writerSkills })} />
        )}
        {shows('rules') && (
          <RecipeGatesSection scriptApproval={values.scriptApproval} scriptEnabled={enabled.has('script')} onChange={(scriptApproval) => update({ scriptApproval })} />
        )}
        {shows('rules') && <RecipeInputsSection values={values} onChange={update} />}
        {shows('review') && <RecipeChecklistSection items={values.checklist} onChange={(checklist) => update({ checklist })} />}
      </fieldset>
      {(shows('bindings') || isLastStep) && <CompositionConflictList conflicts={conflicts} id={CONFLICT_LIST_ID} />}
      <div className={layout.formFooter}>
        <Link href={cancelHref} className={buttonClassName({ variant: 'secondary' })}>
          {t.recipes.editor.cancel}
        </Link>
        {wizard && stepIndex > 0 && (
          <Button type="button" variant="secondary" disabled={submitting} onClick={() => goToStep(recipeWizardSteps[stepIndex - 1] ?? step)}>
            {t.recipes.wizard.back}
          </Button>
        )}
        {isLastStep ? (
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={submitting || conflicts.length > 0}
              aria-describedby={conflicts.length > 0 ? CONFLICT_LIST_ID : undefined}
              onClick={() => {
                createVideoAfterSaveRef.current = true;
                formRef.current?.requestSubmit();
              }}
            >
              {t.cart.recipe.saveAndCreateVideo}
            </Button>
            <Button
              type="submit"
              loading={submitting}
              loadingLabel={t.recipes.editor.saving}
              disabled={conflicts.length > 0}
              aria-describedby={conflicts.length > 0 ? CONFLICT_LIST_ID : undefined}
            >
              {base === null ? t.recipes.editor.saveRecipe : t.recipes.editor.saveAsVersion(base.nextVersion)}
            </Button>
          </>
        ) : (
          <Button type="submit">{t.recipes.wizard.next}</Button>
        )}
      </div>
    </form>
  );
}
