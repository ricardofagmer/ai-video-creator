import { type RecipeRef } from '@studio/shared/recipes';
import { RecipesError } from '../recipes.errors';

/**
 * Criterion 35 (SPEC 0003 section 5.4, R2-AC-18, B15): recipe versions are gated like asset
 * versions; the status route never activates. Same name as the catalog's error on purpose: the api
 * derives the reason `promotion-approval-required` from the name and answers 422 for both.
 */
export class PromotionApprovalRequiredError extends RecipesError {
  override readonly category = 'validation';

  constructor(readonly ref: RecipeRef) {
    super(`${ref} becomes active only through a recorded promotion approval`);
    this.name = 'PromotionApprovalRequiredError';
  }
}
