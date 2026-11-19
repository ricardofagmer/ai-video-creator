import { Query } from '@nestjs/cqrs';
import { type RecipeVersionView } from '../recipe-version.mapper';

/**
 * Resolves `recipeId@version` to the saved version and its pin (`contentHash`). The row is
 * re-checked against its hash on every read, so a resolved pin is always the stored definition.
 */
export class GetRecipeVersionQuery extends Query<RecipeVersionView> {
  /** C2 `RecipeRef`; validated by the handler. */
  constructor(readonly ref: string) {
    super();
  }
}
