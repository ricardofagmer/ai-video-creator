import { type RecipeVersionView } from '@studio/shared/api';
import { BRIEF_INSTRUCTIONS_MAX, type Brief } from '@studio/shared/recipes';
import { type RunsApi } from '@/features/runs/runs-api';
import { type StudioClient } from '@/lib/api';
import { type SavedComposition } from './wizard-draft';
import { compositionKeyOf, definitionOf, type ComposedRecipe } from './wizard-recipe';

/** The three calls "Iniciar" may make, injected so the sequence can be checked without a network. */
export interface WizardStartCalls {
  saveRecipeVersion: StudioClient['saveRecipeVersion'];
  createRun: RunsApi['createRun'];
  startRun: RunsApi['startRun'];
}

export interface WizardStartInput {
  base: RecipeVersionView;
  composed: ComposedRecipe;
  brief: Brief;
  instructions: string;
  references: readonly string[];
  /** A version an earlier attempt saved; reused when it matches these pins. */
  saved: SavedComposition | null;
}

export type WizardStartOutcome =
  | { kind: 'started'; runId: string }
  /** The draft run exists but `start` failed; the production step offers to start it again. */
  | { kind: 'start-failed'; runId: string }
  | { kind: 'save-failed'; error: unknown }
  /** `saved` is the version this attempt (or an earlier one) saved, kept so a retry does not save another. */
  | { kind: 'create-failed'; error: unknown; saved: SavedComposition | null };

/**
 * "Iniciar" (guided-creation spec section 5). A voice or template lives in a recipe version, so
 * when step 3 changed a pin a new draft version of the base recipe is saved first (drafts run;
 * core refuses deprecated versions only). Then the run is created and started with the same
 * calls and body as the new-run form. Nothing is saved before this is called.
 */
export async function startWizardRun(calls: WizardStartCalls, input: WizardStartInput): Promise<WizardStartOutcome> {
  let recipeRef = input.base.ref;
  let saved: SavedComposition | null = null;
  if (input.composed.changed) {
    const key = compositionKeyOf(input.base.ref, input.composed.recipe);
    if (input.saved !== null && input.saved.key === key) {
      saved = input.saved;
    } else {
      try {
        const version = await calls.saveRecipeVersion(input.base.recipe.id, { definition: definitionOf(input.composed.recipe) });
        saved = { key, ref: version.ref };
      } catch (error) {
        return { kind: 'save-failed', error };
      }
    }
    recipeRef = saved.ref;
  }

  const instructions = input.instructions.trim().slice(0, BRIEF_INSTRUCTIONS_MAX);
  let runId: string;
  try {
    const draft = await calls.createRun({
      recipeRef,
      brief: instructions === '' ? input.brief : { ...input.brief, instructions },
      references: input.references.length === 0 ? undefined : [...input.references],
    });
    runId = draft.run.runId;
  } catch (error) {
    return { kind: 'create-failed', error, saved };
  }

  try {
    await calls.startRun(runId);
    return { kind: 'started', runId };
  } catch {
    return { kind: 'start-failed', runId };
  }
}

/** `/criar?execucao=<runId>`, the production and result steps; `aviso` matches the run page's notice. */
export function wizardRunHref(runId: string, startFailed: boolean): string {
  const query = new URLSearchParams({ execucao: runId });
  if (startFailed) query.set('aviso', 'inicio-falhou');
  return `/criar?${query.toString()}`;
}
