'use client';

import { type RecipeVersionView } from '@studio/shared/api';
import { type CompositionConflict, type MusicChoice } from '@studio/shared/recipes';
import { Alert, Button } from '@studio/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { conflictsOfApiError } from '@/features/common/composition-conflict-text';
import { describeApiError } from '@/features/common/api-error-text';
import layout from '@/features/common/layout.module.css';
import { type BindingOption } from '@/features/recipes/recipe-form-model';
import { defaultTargetDuration, newRunFieldIds, type NewRunErrors, type NewRunField } from '@/features/runs/new-run-model';
import { describeRunError } from '@/features/runs/run-error-text';
import { browserRunsApi } from '@/features/runs/runs-api';
import { browserStudioClient } from '@/lib/api';
import { useWebMessages } from '@/lib/i18n/client';
import { useWizardDraft } from '../hooks/useWizardDraft';
import { type WizardDraft } from '../wizard-draft';
import { type WizardSlot } from '../wizard-recipe';
import { reviewOf } from '../wizard-review';
import { startWizardRun, wizardRunHref, type WizardStartCalls } from '../wizard-start';
import { nextDraftStep, previousDraftStep, type DraftStep } from '../wizard-steps';
import styles from '../wizard.module.css';
import { WizardIdeaStep } from './WizardIdeaStep';
import { WizardRecipeStep } from './WizardRecipeStep';
import { WizardReferencesStep } from './WizardReferencesStep';
import { WizardReviewStep } from './WizardReviewStep';
import { WizardStepList } from './WizardStepList';
import { WizardStyleStep } from './WizardStyleStep';

/** The C2 topic bounds the brief schema enforces; the full brief is checked again at review. */
const TOPIC_MIN = 3;
const TOPIC_MAX = 300;

const startCalls: WizardStartCalls = {
  saveRecipeVersion: browserStudioClient.saveRecipeVersion,
  createRun: browserRunsApi.createRun,
  startRun: browserRunsApi.startRun,
};

interface WizardFlowProps {
  /** Runnable recipe versions (draft or active), sorted by name. */
  recipes: readonly RecipeVersionView[];
  /** Active catalog versions for the step 3 slots, plus every recipe's own pins. */
  options: readonly BindingOption[];
}

/** A recipe chosen in step 2 resets the step 3 answers: they were pins and the music choice of another recipe. */
function withRecipe(draft: WizardDraft, view: RecipeVersionView): WizardDraft {
  const typed = draft.values.targetDurationSec.trim();
  return {
    ...draft,
    values: { ...draft.values, recipeRef: view.ref, targetDurationSec: typed === '' ? defaultTargetDuration(view.recipe) : typed },
    choices: {},
    musicChoice: null,
    saved: null,
  };
}

/** The preset a draft starts with: the first active version, else the first runnable one. */
function defaultRecipeOf(recipes: readonly RecipeVersionView[]): RecipeVersionView | undefined {
  return recipes.find((view) => view.recipe.status === 'active') ?? recipes[0];
}

/**
 * Steps 0 to 4 of "Criar vídeo" in the browser: one step at a time, Voltar and Avançar to move,
 * the answers kept in the session. Nothing is saved on the server until "Iniciar".
 */
export function WizardFlow({ recipes, options }: WizardFlowProps): ReactElement {
  const t = useWebMessages();
  const router = useRouter();
  const texts = t.wizard;
  const { draft, update, restored, cartReferencesAdded, reset } = useWizardDraft(recipes.map((view) => view.ref));
  const [ideaErrors, setIdeaErrors] = useState<NewRunErrors>({});
  const [recipeError, setRecipeError] = useState<string | undefined>(undefined);
  const [serverConflicts, setServerConflicts] = useState<readonly CompositionConflict[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const stepRef = useRef<HTMLElement>(null);
  const shownStep = useRef<DraftStep | null>(null);

  // Moving to another step puts the keyboard and screen reader at its start; the first render does not move focus.
  useEffect(() => {
    if (shownStep.current !== null && shownStep.current !== draft.step) stepRef.current?.focus();
    shownStep.current = draft.step;
  }, [draft.step]);

  // The preset step is optional: a draft with no preset takes the default one, and step 2 only changes it.
  const defaultRecipe = defaultRecipeOf(recipes);
  useEffect(() => {
    if (draft.values.recipeRef !== '' || defaultRecipe === undefined) return;
    update((current) => (current.values.recipeRef === '' ? withRecipe(current, defaultRecipe) : current));
  }, [draft.values.recipeRef, defaultRecipe, update]);

  const base = recipes.find((view) => view.ref === draft.values.recipeRef);
  const review = reviewOf(draft, recipes, options, t.runs.brief.errors);

  function goTo(step: DraftStep): void {
    update((current) => ({ ...current, step }));
  }

  function changeIdea(field: NewRunField, value: string): void {
    setIdeaErrors((current) => ({ ...current, [field]: undefined }));
    setServerConflicts([]);
    update((current) => ({ ...current, values: { ...current.values, [field]: value } }));
  }

  function chooseRecipe(ref: string): void {
    const view = recipes.find((candidate) => candidate.ref === ref);
    if (view === undefined) return;
    setRecipeError(undefined);
    setServerConflicts([]);
    update((current) => withRecipe(current, view));
  }

  function chooseSlot(slot: WizardSlot, ref: string): void {
    setServerConflicts([]);
    update((current) => ({ ...current, choices: { ...current.choices, [slot]: ref } }));
  }

  function chooseMusic(musicChoice: MusicChoice): void {
    setServerConflicts([]);
    update((current) => ({ ...current, musicChoice }));
  }

  /** Only what the step itself can tell; the brief against the recipe is checked at review. */
  function stepIsReady(step: DraftStep): boolean {
    if (step === 'idea') {
      const topic = draft.values.topic.trim();
      if (topic.length >= TOPIC_MIN && topic.length <= TOPIC_MAX) return true;
      setIdeaErrors({ topic: texts.idea.topicRequired });
      document.getElementById(newRunFieldIds.topic)?.focus();
      return false;
    }
    if (step === 'recipe' && base === undefined) {
      setRecipeError(texts.recipe.required);
      return false;
    }
    return true;
  }

  function advance(): void {
    if (stepIsReady(draft.step)) goTo(nextDraftStep(draft.step));
  }

  function startOver(): void {
    reset();
    setIdeaErrors({});
    setRecipeError(undefined);
    setServerConflicts([]);
    setFailure(null);
  }

  async function start(): Promise<void> {
    if (review.kind !== 'ready' || review.brief.kind !== 'valid' || review.conflicts.length > 0) return;
    setStarting(true);
    setFailure(null);
    const outcome = await startWizardRun(startCalls, {
      base: review.base,
      composed: review.composed,
      brief: review.brief.brief,
      instructions: draft.instructions,
      references: draft.references,
      saved: draft.saved,
    });
    if (outcome.kind === 'started' || outcome.kind === 'start-failed') {
      // The run exists: the answers are spent, and a later visit to /criar starts fresh.
      reset();
      router.push(wizardRunHref(outcome.runId, outcome.kind === 'start-failed'));
      return;
    }
    setStarting(false);
    if (outcome.kind === 'save-failed') {
      setServerConflicts(conflictsOfApiError(outcome.error));
      setFailure(texts.review.saveFailed(describeApiError(outcome.error, t)));
      return;
    }
    const { saved } = outcome;
    // The new version stays saved; remembering it keeps a retry from saving a second copy.
    if (saved !== null) update((current) => ({ ...current, saved }));
    setServerConflicts(conflictsOfApiError(outcome.error));
    const reason = texts.review.createFailed(describeRunError(outcome.error, t));
    setFailure(saved === null ? reason : `${reason} ${texts.review.savedBeforeFailure(saved.ref)}`);
  }

  return (
    <div className={layout.stack}>
      <WizardStepList current={draft.step} texts={texts} />
      {restored && (
        <Alert
          variant="info"
          actions={
            <Button variant="secondary" size="sm" onClick={startOver}>
              {texts.startOver}
            </Button>
          }
        >
          {texts.restored}
        </Alert>
      )}
      <section ref={stepRef} tabIndex={-1} aria-label={texts.steps[draft.step]} className={layout.stack}>
        {draft.step === 'idea' && (
          <WizardIdeaStep
            values={draft.values}
            errors={ideaErrors}
            recipe={base?.recipe}
            instructions={draft.instructions}
            onChange={changeIdea}
            onInstructionsChange={(instructions) => update((current) => ({ ...current, instructions }))}
          />
        )}
        {draft.step === 'references' && (
          <WizardReferencesStep
            references={draft.references}
            onChange={(references) => update((current) => ({ ...current, references }))}
            cartReferencesAdded={cartReferencesAdded}
          />
        )}
        {draft.step === 'recipe' && (
          <WizardRecipeStep
            recipes={recipes}
            selectedRef={draft.values.recipeRef}
            error={recipeError}
            onChoose={chooseRecipe}
            references={draft.references}
            onReferencesChange={(references) => update((current) => ({ ...current, references }))}
          />
        )}
        {draft.step === 'style' && base !== undefined && review.kind === 'ready' && (
          <WizardStyleStep
            base={base.recipe}
            choices={draft.choices}
            musicChoice={draft.musicChoice}
            options={options}
            changed={review.composed.changed}
            onChoose={chooseSlot}
            onMusicChoiceChange={chooseMusic}
          />
        )}
        {draft.step === 'style' && base === undefined && <Alert variant="warning">{texts.recipe.required}</Alert>}
        {draft.step === 'review' && review.kind === 'ready' && (
          <WizardReviewStep
            review={review}
            draft={draft}
            options={options}
            serverConflicts={serverConflicts}
            starting={starting}
            failure={failure}
            onEdit={goTo}
            onStart={() => void start()}
          />
        )}
        {draft.step === 'review' && review.kind === 'no-recipe' && <Alert variant="warning">{texts.recipe.required}</Alert>}
      </section>
      {/* The review step carries its own Voltar and Iniciar; the other steps share this footer. */}
      {(draft.step !== 'review' || review.kind !== 'ready') && (
        <div className={styles.footer}>
          {draft.step === 'idea' ? (
            <Button variant="secondary" onClick={startOver}>
              {texts.startOver}
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => goTo(previousDraftStep(draft.step))}>
              {texts.back}
            </Button>
          )}
          {draft.step !== 'review' && (
            <span className={styles.footerEnd}>
              <Button onClick={advance}>{texts.next}</Button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
