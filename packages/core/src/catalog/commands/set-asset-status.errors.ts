import { type AssetRef } from '@studio/shared/catalog';
import { CatalogError } from '../catalog.errors';

/**
 * Criterion 35 (SPEC 0003 section 5.4, R2-AC-18): the status route never activates. A version
 * becomes `active` only through the promotion module, which records the owner's approval. Declared
 * beside the status command, not in the promotion module, so the catalog never imports promotion
 * code and `@studio/core/promotion` stays reachable from the api alone. The api derives the reason
 * `promotion-approval-required` from the class name and answers 422 (category `validation`).
 */
export class PromotionApprovalRequiredError extends CatalogError {
  override readonly category = 'validation';

  constructor(readonly ref: AssetRef) {
    super(`${ref} becomes active only through a recorded promotion approval`);
    this.name = 'PromotionApprovalRequiredError';
  }
}
