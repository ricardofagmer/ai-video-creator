import { Injectable } from '@nestjs/common';
import { InvalidAssetRefError, parseAssetRef, type AssetVersion } from '@studio/shared/catalog';
import { type AssetResolution, type AssetResolveRequest, type AssetResolverPort } from '@studio/shared/ports';
import { ContentStore } from '../asset-store/content-store';
import { ContentVerifier, type RehashOutcome } from '../asset-store/content-verifier';
import { toAssetVersion } from './asset-version.mapper';
import { AssetVersionRepository } from './asset-version.repository';

/**
 * C6 `AssetResolverPort` over the catalog: reads SQLite only and re-hashes the bytes on every
 * call (criterion 9). It never copies, moves or modifies a file, so the watcher can use it under
 * ADR 0003's read-only rule. R1-06 binds it in the watcher.
 */
@Injectable()
export class CatalogAssetResolver implements AssetResolverPort {
  constructor(
    private readonly versions: AssetVersionRepository,
    private readonly store: ContentStore,
    private readonly verifier: ContentVerifier,
  ) {}

  async resolve(request: AssetResolveRequest): Promise<AssetResolution> {
    let parsed: { assetId: string; version: number };
    try {
      parsed = parseAssetRef(request.ref);
    } catch (error) {
      if (error instanceof InvalidAssetRefError) return { status: 'unknown-ref', ref: request.ref };
      throw error;
    }
    const row = await this.versions.findVersion(parsed.assetId, parsed.version);
    if (row === null) return { status: 'unknown-ref', ref: request.ref };
    const version = toAssetVersion(row);

    const outcome = await this.rehash(version, request.signal);
    if (outcome.status === 'missing') return { status: 'file-missing', ref: request.ref };
    const expected = request.expectedContentHash ?? version.contentHash;
    if (outcome.contentHash !== expected || outcome.contentHash !== version.contentHash) {
      return { status: 'hash-mismatch', ref: request.ref, expected, actual: outcome.contentHash };
    }

    return {
      status: 'resolved',
      asset: {
        ref: request.ref,
        kind: version.kind,
        assetStatus: version.status,
        contentHash: version.contentHash,
        sizeBytes: version.sizeBytes,
        mimeType: version.mimeType,
        layout: version.layout,
        sensitivity: version.sensitivity,
        license: version.license,
        storage: version.storage.mode,
        // A stored folder resolves to its manifest blob; its files are blobs named in the manifest.
        absolutePath:
          version.storage.mode === 'reference' ? version.storage.absolutePath : this.store.blobPath(version.contentHash),
      },
    };
  }

  private async rehash(version: AssetVersion, signal: AbortSignal): Promise<RehashOutcome> {
    return version.storage.mode === 'reference'
      ? this.verifier.rehashReference(version.storage.absolutePath, version.layout, signal)
      : this.verifier.rehashStored(version.contentHash, version.layout, signal);
  }
}
