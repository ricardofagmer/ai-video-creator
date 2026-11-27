import { type TemplateDetails } from '@studio/shared/catalog';
import { recipeConflicts, runConflicts, type CompositionConflict, type Recipe } from '@studio/shared/recipes';

/** Details of the templates the listed recipes pin, by `assetId@version`; the page reads them on the server. */
export type TemplateDetailsByRef = Readonly<Record<string, TemplateDetails>>;

/** The template ref a recipe pins, if any. */
export function templateRefOf(recipe: Pick<Recipe, 'bindings'>): string | null {
  return recipe.bindings.find((binding) => binding.slot === 'template')?.ref ?? null;
}

/**
 * What stops this run from making a video (guided-creation spec section 3): the recipe's own
 * conflicts, plus a target duration the pinned template cannot render. A target that is not a
 * whole number yet is left to the field's own error.
 */
export function newRunConflicts(recipe: Recipe, templates: TemplateDetailsByRef, targetDurationText: string): CompositionConflict[] {
  const ref = templateRefOf(recipe);
  const template = ref === null ? null : (templates[ref] ?? null);
  const text = targetDurationText.trim();
  if (!/^[0-9]{1,4}$/.test(text)) return recipeConflicts(recipe, template);
  return runConflicts(recipe, template, Number.parseInt(text, 10));
}
