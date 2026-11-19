import { Command } from '@nestjs/cqrs';
import { type AssetStatus } from '@studio/shared/catalog';
import { type RecipeVersionView } from '../recipe-version.mapper';

export interface SetRecipeStatusInput {
  /** C2 `RecipeRef` (`recipeId@version`). */
  ref: string;
  status: AssetStatus;
}

export interface SetRecipeStatusResult {
  version: RecipeVersionView;
  /** Kept for the rev 2 result shape; always null since rev 3, because this command never activates. */
  replaced: RecipeVersionView | null;
}

/**
 * Deprecates one version (PRD 5.4 rule 3): nothing is deleted; the `contentHash` never changes. Rev 3
 * (SPEC 0003 section 5.4, B15): `status: 'active'` is refused with `PromotionApprovalRequiredError`;
 * activation goes through the promotion module, which records the owner's approval.
 */
export class SetRecipeStatusCommand extends Command<SetRecipeStatusResult> {
  constructor(readonly input: SetRecipeStatusInput) {
    super();
  }
}
