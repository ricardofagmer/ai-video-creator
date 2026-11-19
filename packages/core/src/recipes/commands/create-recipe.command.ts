import { Command } from '@nestjs/cqrs';
import { type RecipeVersionView } from '../recipe-version.mapper';
import { type RecipeDraftInput } from '../recipe-version.factory';

export interface CreateRecipeInput {
  /** C2 `RecipeId` of a new recipe. */
  recipeId: string;
  /** Every C2 field except `id`, `version`, `status` and the timestamps, which the studio sets. */
  definition: RecipeDraftInput;
}

/** Creates the recipe and its version 1 as `draft`; every binding must pin an existing catalog version. */
export class CreateRecipeCommand extends Command<RecipeVersionView> {
  constructor(readonly input: CreateRecipeInput) {
    super();
  }
}
