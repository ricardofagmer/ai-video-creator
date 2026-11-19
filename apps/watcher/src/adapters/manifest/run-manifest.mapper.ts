import { type AssetRef } from '@studio/shared/catalog';
import type { ResolvedAsset } from '@studio/shared/ports';
import { type BindingSlot } from '@studio/shared/recipes';
import {
  type EgressEntry,
  type ModelUse,
  type RunFile,
  type RunManifest,
  type StageInputManifest,
} from '@studio/shared/run-format';

/** One hashed output as `manifest.json` lists it (RUN-FORMAT section 18). */
export type RunManifestOutput = RunManifest['outputs'][number];

export interface RunManifestSource {
  run: Readonly<RunFile>;
  /** The assets the calling stage resolved and re-hashed at its `preflight` (C6 `StageExecutionContext.assets`). */
  assets: readonly ResolvedAsset[];
  /** Input manifests of every stage that ran, in stage order; they hold the parameters and models used. */
  stageManifests: readonly StageInputManifest[];
  outputs: readonly RunManifestOutput[];
  egress: readonly EgressEntry[];
  createdAt: Date;
}

/** A bound asset the run pins was not among the re-hashed assets, or re-hashed to another value. */
export class ManifestAssetUnverifiedError extends Error {
  readonly category = 'internal';

  constructor(
    readonly slot: BindingSlot,
    readonly ref: AssetRef,
  ) {
    super(`Bound asset ${ref} (${slot}) was not verified by preflight; the manifest cannot pin it`);
    this.name = 'ManifestAssetUnverifiedError';
  }
}

function verifiedAsset(byRef: ReadonlyMap<string, ResolvedAsset>, slot: BindingSlot, ref: AssetRef): ResolvedAsset {
  const asset = byRef.get(ref);
  if (asset === undefined) throw new ManifestAssetUnverifiedError(slot, ref);
  return asset;
}

/** Each role and model id pair once, in first-seen order. */
function distinctModels(manifests: readonly StageInputManifest[]): ModelUse[] {
  const models: ModelUse[] = [];
  for (const use of manifests.flatMap((manifest) => manifest.models)) {
    if (!models.some((known) => known.role === use.role && known.modelId === use.modelId)) models.push({ role: use.role, modelId: use.modelId });
  }
  return models;
}

/**
 * `manifest.json` (PRD 7.4, criterion 8): the recipe pin, every bound `assetId@version` with the
 * hash preflight verified, the run references, the brief and per-stage parameters actually used,
 * and the model ids. Pure: the builder gathers the inputs, the `package` stage writes the file.
 */
export function toRunManifest(source: RunManifestSource): RunManifest {
  const { run } = source;
  const byRef = new Map(source.assets.map((asset) => [asset.ref, asset]));
  return {
    format: 1,
    runId: run.runId,
    createdAt: source.createdAt.toISOString(),
    recipe: { ref: run.recipe.ref, contentHash: run.recipe.contentHash },
    assets: run.recipe.definition.bindings.map((binding) => {
      const asset = verifiedAsset(byRef, binding.slot, binding.ref);
      if (asset.contentHash !== binding.contentHash) throw new ManifestAssetUnverifiedError(binding.slot, binding.ref);
      return { slot: binding.slot, ref: binding.ref, kind: asset.kind, contentHash: asset.contentHash, sensitivity: asset.sensitivity };
    }),
    references: run.references.map((ref, index) => ({ ref, contentHash: verifiedAsset(byRef, `reference:${index + 1}`, ref).contentHash })),
    parameters: {
      brief: run.brief,
      stages: source.stageManifests.map((manifest) => ({ stageId: manifest.stageId, params: manifest.parameters })),
    },
    models: distinctModels(source.stageManifests),
    outputs: [...source.outputs],
    egress: [...source.egress],
  };
}
