import 'server-only';
import { type RecipeVersionView } from '@studio/shared/api';
import { type Binding } from '@studio/shared/recipes';
import { type Locale } from '@studio/ui';
import { loadBindingOptions } from '@/features/recipes/binding-options.server';
import { type BindingOption } from '@/features/recipes/recipe-form-model';
import { serverStudioClient } from '@/lib/api/server';
import { wizardSlotsOf } from './wizard-recipe';

export interface WizardSetup {
  recipes: readonly RecipeVersionView[];
  /** Catalog versions step 3 may pin, with template details and the "can be heard" mark. */
  options: readonly BindingOption[];
}

/** Draft and active versions both run (core `RecipeNotRunnableError` refuses deprecated only), as on "Nova execução". */
async function loadRunnableRecipes(locale: Locale): Promise<RecipeVersionView[]> {
  const page = await serverStudioClient().listRecipes({ statuses: ['active', 'draft'], limit: 100 });
  return [...page.items].sort(
    (left, right) => left.recipe.name.localeCompare(right.recipe.name, locale) || right.recipe.version - left.recipe.version,
  );
}

/** The step 3 pins of every listed recipe, once each, so a recipe's own non-active pin is still offered as its default. */
function wizardPinsOf(recipes: readonly RecipeVersionView[]): Binding[] {
  const pins = new Map<string, Binding>();
  for (const view of recipes) {
    const slots = new Set<string>(wizardSlotsOf(view.recipe).map((spec) => spec.slot));
    for (const binding of view.recipe.bindings) {
      if (slots.has(binding.slot) && !pins.has(binding.ref)) pins.set(binding.ref, binding);
    }
  }
  return [...pins.values()];
}

const wizardKinds = new Set<string>(['ai-model', 'template', 'brand-kit', 'music']);

/**
 * What steps 2 to 4 need, read on the server like "Nova execução" and the recipe editor do. Only
 * names, refs, hashes and template details cross to the browser (the editor's own loader).
 */
export async function loadWizardSetup(locale: Locale): Promise<WizardSetup> {
  const recipes = await loadRunnableRecipes(locale);
  if (recipes.length === 0) return { recipes, options: [] };
  const options = await loadBindingOptions(wizardPinsOf(recipes));
  return { recipes, options: options.filter((option) => wizardKinds.has(option.kind)) };
}
