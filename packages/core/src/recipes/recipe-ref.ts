import { type RecipeId, type RecipeRef } from '@studio/shared/recipes';

export interface ParsedRecipeRef {
  recipeId: RecipeId;
  version: number;
}

/** Splits a C2 `RecipeRef` that already passed `RecipeRefSchema` (`/^[a-z0-9-]+@\d+$/`). */
export function parseRecipeRef(ref: RecipeRef): ParsedRecipeRef {
  const separator = ref.lastIndexOf('@');
  return { recipeId: ref.slice(0, separator), version: Number.parseInt(ref.slice(separator + 1), 10) };
}
