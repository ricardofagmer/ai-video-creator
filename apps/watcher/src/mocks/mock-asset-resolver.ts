import { type AbsolutePath } from '@studio/shared/catalog';
import type { AssetResolution, AssetResolveRequest, AssetResolverPort } from '@studio/shared/ports';
import { findMockCatalogEntry, type MockCatalogEntry } from './fixtures/catalog.fixtures';

/**
 * Root of the paths the mock resolver hands out. Nothing reads them: mock executors never open
 * asset bytes, so the root only has to be a valid absolute path that no real catalog uses.
 */
const MOCK_CATALOG_ROOT = '/studio-mock-catalog';

function mockPath(entry: MockCatalogEntry): AbsolutePath {
  return `${MOCK_CATALOG_ROOT}/${entry.ref.replace('@', '/')}`;
}

/** In-memory catalog (R1-04). R1-06 binds its SQLite adapter to `ASSET_RESOLVER` instead. */
export class MockAssetResolver implements AssetResolverPort {
  async resolve(request: AssetResolveRequest): Promise<AssetResolution> {
    request.signal.throwIfAborted();
    const entry = findMockCatalogEntry(request.ref);
    if (entry === undefined) return { status: 'unknown-ref', ref: request.ref };
    if (request.expectedContentHash !== null && request.expectedContentHash !== entry.contentHash) {
      return { status: 'hash-mismatch', ref: request.ref, expected: request.expectedContentHash, actual: entry.contentHash };
    }
    return {
      status: 'resolved',
      asset: {
        ref: entry.ref,
        kind: entry.kind,
        assetStatus: 'active',
        contentHash: entry.contentHash,
        sizeBytes: entry.sizeBytes,
        mimeType: entry.mimeType,
        layout: entry.layout,
        sensitivity: entry.sensitivity,
        license: entry.license,
        storage: 'store',
        absolutePath: mockPath(entry),
      },
    };
  }
}
