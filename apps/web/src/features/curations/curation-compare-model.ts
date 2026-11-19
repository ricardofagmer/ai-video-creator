import { type RecipeVersionView } from '@studio/shared/api';
import { assetRefPattern, parseAssetRef } from '@studio/shared/catalog';
import { slotLabel } from '@/features/comparisons/comparison-labels';
import { type SelectOption } from '@/features/comparisons/comparison-form-model';

/**
 * One recipe version that can be arm A of a curation's comparison. For a prompt or skill subject,
 * `slots` are the bindings whose asset is the subject's asset: arm B swaps exactly that binding for
 * the saved draft (SPEC 0005 section 5.7). A recipe subject has one option, the subject itself,
 * and no slot.
 */
export interface CompareArmOption {
  recipe: RecipeVersionView;
  slots: readonly SelectOption[];
}

/** Runnable recipe versions that bind `assetId` in at least one slot, with those slots. */
export function assetSubjectArmOptions(recipes: readonly RecipeVersionView[], assetId: string): CompareArmOption[] {
  return recipes
    .map((recipe) => ({
      recipe,
      slots: recipe.recipe.bindings
        .filter((binding) => assetRefPattern.test(binding.ref) && parseAssetRef(binding.ref).assetId === assetId)
        .map((binding) => ({ value: binding.slot, label: `${slotLabel(binding.slot)} · ${binding.ref}` })),
    }))
    .filter((option) => option.slots.length > 0);
}
