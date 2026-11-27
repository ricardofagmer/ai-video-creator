import { Command } from '@nestjs/cqrs';
import { type AssetVersion } from '@studio/shared/catalog';
import { type AssetJobTarget } from '../asset-jobs.input';

/**
 * `POST /catalog/assets/:assetId/versions/:version/purpose/generation` (ADR 0012, C-P4): the
 * owner asks for a new purpose text. An open job is refused with `AssetPurposeJobOpenError` (409);
 * otherwise the row's `purposeSource` becomes `none` and a new job is requested. Returns the
 * version as it reads afterwards.
 */
export class RequestAssetPurposeGenerationCommand extends Command<AssetVersion> {
  /** Validated by the handler. */
  constructor(readonly target: AssetJobTarget) {
    super();
  }
}
