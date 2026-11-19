import { Query } from '@nestjs/cqrs';
import { type PromotionApprovalView } from '@studio/shared/api';
import { type PromotionTarget } from '../promote-version.command';

export interface VersionActivation {
  /** `assetId@version` or `recipeId@version`, as asked. */
  ref: string;
  /** C10 `activation`: null when the version is not active or was active before R2 (B15). */
  activation: PromotionApprovalView | null;
}

/**
 * Read-only: the `activation` field of `AssetVersionView` and `RecipeVersionView` for up to 100
 * refs of one target kind. An unknown ref is answered with `activation: null`; the version read
 * that built the view already reported it missing.
 */
export class GetVersionActivationsQuery extends Query<VersionActivation[]> {
  constructor(
    readonly target: PromotionTarget,
    readonly refs: readonly string[],
  ) {
    super();
  }
}
