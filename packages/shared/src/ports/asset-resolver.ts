import type { AbsolutePath, Sha256 } from '../common/ids';
import type { AssetKind, AssetRef, AssetStatus, Sensitivity } from '../catalog/asset-kind';
import type { AssetLayout } from '../catalog/asset-version';
import type { License } from '../catalog/provenance';

/** A catalog version whose bytes were found and re-hashed. */
export interface ResolvedAsset {
  ref: AssetRef;
  kind: AssetKind;
  assetStatus: AssetStatus;
  contentHash: Sha256;
  sizeBytes: number;
  mimeType: string;
  layout: AssetLayout;
  sensitivity: Sensitivity;
  license: License | null;
  storage: 'store' | 'reference';
  /**
   * Path the stage tools read: the store blob or the registered reference path. For a biometric
   * asset it is passed to the tool by path only and never placed in agent-readable context.
   */
  absolutePath: AbsolutePath;
}

export interface AssetResolveRequest {
  ref: AssetRef;
  /** The hash pinned by the recipe binding or manifest; null when only the catalog row is known. */
  expectedContentHash: Sha256 | null;
  signal: AbortSignal;
}

/** Every outcome names the asset, so `preflight` can stop with a reason naming it (criterion 9). */
export type AssetResolution =
  | { status: 'resolved'; asset: ResolvedAsset }
  | { status: 'unknown-ref'; ref: AssetRef }
  | { status: 'file-missing'; ref: AssetRef }
  | { status: 'hash-mismatch'; ref: AssetRef; expected: Sha256; actual: Sha256 };

/**
 * Read-only catalog access for the watcher (ADR 0003: the watcher only reads SQLite). The adapter
 * re-hashes the bytes on every call; it never copies, moves or modifies them.
 */
export interface AssetResolverPort {
  resolve(request: AssetResolveRequest): Promise<AssetResolution>;
}
