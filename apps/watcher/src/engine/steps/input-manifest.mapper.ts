import { type JsonObject } from '@studio/shared/catalog';
import { type ModelUse, type RunId, type Sha256, type StageBrief, type StageInputManifest } from '@studio/shared/run-format';
import { type BoundAsset } from '../postconditions/asset-resolution';

export interface InputManifestSource {
  runId: RunId;
  brief: StageBrief;
  briefHash: Sha256;
  attempt: number;
  assets: readonly BoundAsset[];
  parameters: JsonObject;
  createdAt: Date;
}

/**
 * Stage input manifest (ADR 0003 decision 4). Assets appear by ref and hash only, never by path,
 * so a biometric reference path never lands in the run folder. `models` starts empty: the
 * executor names its models only in its `execute` result, which `recordModelsUsed` adds.
 */
export function toInputManifest(source: InputManifestSource): StageInputManifest {
  return {
    runId: source.runId,
    stageNumber: source.brief.stageNumber,
    stageId: source.brief.stageId,
    attempt: source.attempt,
    createdAt: source.createdAt.toISOString(),
    briefHash: source.briefHash,
    assets: source.assets.map(({ slot, asset }) => ({
      slot,
      ref: asset.ref,
      kind: asset.kind,
      contentHash: asset.contentHash,
      sizeBytes: asset.sizeBytes,
      storage: asset.storage,
    })),
    inputs: [...source.brief.inputs],
    parameters: source.parameters,
    models: [],
  };
}

/** Recorded models plus the newly reported ones, each role and model id pair once, in first-seen order. */
export function mergeModelUses(recorded: readonly ModelUse[], reported: readonly ModelUse[]): ModelUse[] {
  const merged: ModelUse[] = [...recorded];
  for (const use of reported) {
    const known = merged.some((candidate) => candidate.role === use.role && candidate.modelId === use.modelId);
    if (!known) merged.push({ role: use.role, modelId: use.modelId });
  }
  return merged;
}
