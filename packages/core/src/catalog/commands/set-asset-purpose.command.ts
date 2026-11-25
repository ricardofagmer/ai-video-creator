import { Command } from '@nestjs/cqrs';
import { type AssetVersion } from '@studio/shared/catalog';

export interface SetAssetPurposeInput {
  /** C1 `AssetId`; validated by the handler. */
  assetId: string;
  /** Version number, 1 or more; validated by the handler. */
  version: number;
  /** C-P4 owner text, 1..280 characters of plain text after trimming; validated by the handler. */
  purpose: string;
}

/**
 * `PUT /catalog/assets/:assetId/versions/:version/purpose` (ADR 0012 decision 7, C-P4): the owner
 * writes the purpose text, which sets `purposeSource: owner`. No job overwrites it afterwards
 * (AP-03); only the owner's own regenerate request clears it. Registered in `CatalogModule` only,
 * never in `CatalogReadModule`, so the watcher cannot reach it. Returns the version as it reads
 * afterwards.
 */
export class SetAssetPurposeCommand extends Command<AssetVersion> {
  constructor(readonly input: SetAssetPurposeInput) {
    super();
  }
}
