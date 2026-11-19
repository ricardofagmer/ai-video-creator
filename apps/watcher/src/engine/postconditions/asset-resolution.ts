import type { AssetResolution, AssetResolverPort, ResolvedAsset } from '@studio/shared/ports';
import { type AssetRef } from '@studio/shared/catalog';
import { type BindingSlot } from '@studio/shared/recipes';
import { type RunFile, type Sha256 } from '@studio/shared/run-format';

/** A resolved asset with the recipe slot (or `reference:<n>` for a run reference) that bound it. */
export interface BoundAsset {
  slot: BindingSlot;
  asset: ResolvedAsset;
}

export interface BoundAssetResolution {
  assets: BoundAsset[];
  /** pt-BR, one per asset that did not resolve; each names the asset (criterion 9). */
  problems: string[];
}

interface BindingRequest {
  slot: BindingSlot;
  ref: AssetRef;
  expectedContentHash: Sha256 | null;
}

function shortHash(hash: Sha256): string {
  return hash.slice(0, 12);
}

function describeProblem(resolution: Exclude<AssetResolution, { status: 'resolved' }>): string {
  switch (resolution.status) {
    case 'unknown-ref':
      return `O ativo ${resolution.ref} não existe no catálogo.`;
    case 'file-missing':
      return `O arquivo do ativo ${resolution.ref} não foi encontrado.`;
    case 'hash-mismatch':
      return `O ativo ${resolution.ref} mudou: hash fixado ${shortHash(resolution.expected)}, encontrado ${shortHash(resolution.actual)}.`;
  }
}

/** Recipe bindings carry the pinned hash; run references are pinned by the catalog row only. */
function bindingRequests(run: Readonly<RunFile>): BindingRequest[] {
  const bindings = run.recipe.definition.bindings.map(
    (binding): BindingRequest => ({ slot: binding.slot, ref: binding.ref, expectedContentHash: binding.contentHash }),
  );
  const references = run.references.map(
    (ref, index): BindingRequest => ({ slot: `reference:${index + 1}`, ref, expectedContentHash: null }),
  );
  return [...bindings, ...references];
}

/**
 * The `preflight` postcondition: every bound asset resolves and its bytes re-hash to the pinned
 * hash (ADR 0003 decision 1). Requests run one after another: re-hashing large referenced assets
 * in parallel would compete for the same disk.
 */
export async function resolveBoundAssets(
  resolver: AssetResolverPort,
  run: Readonly<RunFile>,
  signal: AbortSignal,
): Promise<BoundAssetResolution> {
  const result: BoundAssetResolution = { assets: [], problems: [] };
  for (const request of bindingRequests(run)) {
    const resolution = await resolver.resolve({ ref: request.ref, expectedContentHash: request.expectedContentHash, signal });
    if (resolution.status === 'resolved') result.assets.push({ slot: request.slot, asset: resolution.asset });
    else result.problems.push(describeProblem(resolution));
  }
  return result;
}
