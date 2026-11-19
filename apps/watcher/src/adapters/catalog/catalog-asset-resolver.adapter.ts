import { Logger, type Provider } from '@nestjs/common';
import { CatalogAssetResolver } from '@studio/core/catalog';
import type { AssetResolution, AssetResolveRequest, AssetResolverPort } from '@studio/shared/ports';
import { ASSET_RESOLVER } from '../../engine/engine.tokens';

/**
 * C6 `AssetResolverPort` for the watcher, backed by the catalog in SQLite (R1-06). It delegates
 * to core's `CatalogAssetResolver`, which reads catalog rows and re-hashes the bytes on every
 * call; nothing here dispatches a command, touches the CQRS buses or writes a file (ADR 0003:
 * the watcher only reads SQLite). Outcomes are logged by ref only, because a resolved path can
 * point at biometric material (PRD 12).
 */
export class CatalogAssetResolverAdapter implements AssetResolverPort {
  private readonly logger = new Logger(CatalogAssetResolverAdapter.name);

  constructor(private readonly catalog: CatalogAssetResolver) {}

  async resolve(request: AssetResolveRequest): Promise<AssetResolution> {
    const startedAt = Date.now();
    const resolution = await this.catalog.resolve(request);
    const durationMs = Date.now() - startedAt;
    if (resolution.status === 'resolved') {
      this.logger.debug({ event: 'asset.resolved', ref: resolution.asset.ref, storage: resolution.asset.storage, durationMs });
    } else {
      this.logger.warn({ event: 'asset.unresolved', ref: resolution.ref, outcome: resolution.status, durationMs });
    }
    return resolution;
  }
}

/** Replaces `mockAssetResolverProvider` when the composition root selects the real catalog. */
export const catalogAssetResolverProvider: Provider = {
  provide: ASSET_RESOLVER,
  useFactory: (catalog: CatalogAssetResolver): AssetResolverPort => new CatalogAssetResolverAdapter(catalog),
  inject: [CatalogAssetResolver],
};
