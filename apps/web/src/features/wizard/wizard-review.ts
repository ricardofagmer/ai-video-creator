import { type RecipeVersionView } from '@studio/shared/api';
import { type TemplateDetails } from '@studio/shared/catalog';
import { type CompositionConflict } from '@studio/shared/recipes';
import { type BindingOption } from '@/features/recipes/recipe-form-model';
import { buildBrief, type BriefErrorTexts, type BriefResult } from '@/features/runs/new-run-model';
import { newRunConflicts, type TemplateDetailsByRef } from '@/features/runs/run-composition';
import { type WizardDraft } from './wizard-draft';
import { composeRecipe, type ComposedRecipe } from './wizard-recipe';

/** Everything step 4 shows and "Iniciar" needs, derived from the draft on every render. */
export type WizardReview =
  | { kind: 'no-recipe' }
  | {
      kind: 'ready';
      base: RecipeVersionView;
      composed: ComposedRecipe;
      brief: BriefResult;
      conflicts: CompositionConflict[];
    };

/** Template details by ref, from the options the server loaded (active versions and the recipes' own pins). */
export function templatesOf(options: readonly BindingOption[]): TemplateDetailsByRef {
  const byRef: Record<string, TemplateDetails> = {};
  for (const option of options) {
    if (option.kind === 'template' && option.templateDetails !== undefined) byRef[option.ref] = option.templateDetails;
  }
  return byRef;
}

/**
 * The run the draft would start: the base recipe with the step 3 pins, the brief built the way
 * the new-run form builds it, and every composition conflict (guided-creation spec section 3)
 * of that recipe with that target duration. The api checks the same rules again.
 */
export function reviewOf(
  draft: WizardDraft,
  recipes: readonly RecipeVersionView[],
  options: readonly BindingOption[],
  briefTexts: BriefErrorTexts,
): WizardReview {
  const base = recipes.find((view) => view.ref === draft.values.recipeRef);
  if (base === undefined) return { kind: 'no-recipe' };
  const composed = composeRecipe(base.recipe, draft.choices, options);
  return {
    kind: 'ready',
    base,
    composed,
    brief: buildBrief(draft.values, composed.recipe, briefTexts),
    conflicts: newRunConflicts(composed.recipe, templatesOf(options), draft.values.targetDurationSec),
  };
}
