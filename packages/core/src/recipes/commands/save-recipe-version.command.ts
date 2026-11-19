import { Command } from '@nestjs/cqrs';
import { type RecipeVersionView } from '../recipe-version.mapper';
import { type RecipeDraftInput } from '../recipe-version.factory';

export interface SaveRecipeVersionInput {
  /** C2 `RecipeId` of an existing recipe. */
  recipeId: string;
  /** The full definition of the new version; nothing is inherited implicitly. */
  definition: RecipeDraftInput;
}

/**
 * An edit (PRD 6 "same versioning rules as assets", PRD 5.4 rule 1): inserts version N+1 as
 * `draft` and never touches version N.
 */
export class SaveRecipeVersionCommand extends Command<RecipeVersionView> {
  constructor(readonly input: SaveRecipeVersionInput) {
    super();
  }
}
