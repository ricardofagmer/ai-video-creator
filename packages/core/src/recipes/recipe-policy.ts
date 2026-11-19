import { type AssetStatus } from '@studio/shared/catalog';
import { type RecipeRef } from '@studio/shared/recipes';
import { InvalidRecipeStatusTransitionError } from './recipes.errors';

/**
 * PRD 6: recipes follow the asset versioning rules (PRD 5.4). A version starts as `draft`;
 * promotion is explicit; deprecation keeps the row; nothing returns to `draft`. A deprecated
 * version may be promoted again because past runs still pin it.
 */
const ALLOWED_STATUS_TRANSITIONS: Readonly<Record<AssetStatus, readonly AssetStatus[]>> = {
  draft: ['active', 'deprecated'],
  active: ['deprecated'],
  deprecated: ['active'],
};

export function assertRecipeStatusTransition(ref: RecipeRef, from: AssetStatus, to: AssetStatus): void {
  if (!ALLOWED_STATUS_TRANSITIONS[from].includes(to)) throw new InvalidRecipeStatusTransitionError(ref, from, to);
}

/**
 * Statuses a new run may start from. A saved draft is runnable (PRD 6 step 1: pick assets, save
 * them as a recipe, run it); a deprecated version stays resolvable for past runs only.
 */
export const RUNNABLE_RECIPE_STATUSES: readonly AssetStatus[] = ['draft', 'active'];
