import { Command } from '@nestjs/cqrs';
import { type AssetVersion } from '@studio/shared/catalog';

export interface SetAssetStatusInput {
  /** C1 `AssetRef` (`assetId@version`); validated by the handler. */
  ref: string;
  /** C1 `AssetStatus`; validated by the handler. */
  status: string;
}

export interface SetAssetStatusResult {
  version: AssetVersion;
}

/**
 * Deprecation (PRD 5.4 rule 3): changes `status` only; no row or blob is ever deleted. Rev 3
 * (SPEC 0003 section 5.4, criterion 35): `status: 'active'` is refused with
 * `PromotionApprovalRequiredError`; activation goes through the promotion module, which records
 * the owner's approval.
 */
export class SetAssetStatusCommand extends Command<SetAssetStatusResult> {
  constructor(readonly input: SetAssetStatusInput) {
    super();
  }
}
