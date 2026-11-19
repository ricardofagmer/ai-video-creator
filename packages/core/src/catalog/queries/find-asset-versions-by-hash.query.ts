import { Query } from '@nestjs/cqrs';
import { type AssetVersion } from '@studio/shared/catalog';

/**
 * Versions whose `contentHash` equals the given sha-256, oldest first (at most
 * `MAX_VERSIONS_PER_HASH`). Lets the seed and imports find content that is already registered.
 */
export class FindAssetVersionsByContentHashQuery extends Query<AssetVersion[]> {
  /** Lowercase hex sha-256; validated by the handler. */
  constructor(readonly contentHash: string) {
    super();
  }
}
