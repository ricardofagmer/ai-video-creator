import type { AssetResolverPort, ResolvedAsset, StageExecutorPort, StagePlanningContext } from '@studio/shared/ports';
import { readStageBrief, readStageInputManifest, writeStageInputManifest } from '@studio/shared/run-files';
import { type RecipeStage } from '@studio/shared/recipes';
import {
  type JsonObject,
  type ModelUse,
  type RunFile,
  type StageBrief,
  type StageId,
  type StageInputManifest,
  type StageLocation,
} from '@studio/shared/run-format';
import { type ActiveRun } from './active-run';
import { BoundAssetUnavailableError } from './engine.errors';
import { resolveBoundAssets, type BoundAsset } from './postconditions/asset-resolution';
import { mergeModelUses } from './steps/input-manifest.mapper';

export interface StageWorkspaceOptions {
  active: ActiveRun;
  location: StageLocation;
  executor: StageExecutorPort;
  resolver: AssetResolverPort;
}

/** The recipe's entry for a stage; a stage absent from the graph runs with no params or checks. */
export function recipeStageOf(run: Readonly<RunFile>, stageId: StageId): RecipeStage | undefined {
  return run.recipe.definition.graph.stages.find((stage) => stage.stageId === stageId);
}

/** Planning context of any stage of the run, e.g. to estimate or draft a stage that has not started. */
export function planningContextFor(run: Readonly<RunFile>, location: StageLocation, params: JsonObject): StagePlanningContext {
  return {
    runId: run.runId,
    stage: location,
    brief: run.brief,
    recipe: run.recipe.definition,
    recipePin: { ref: run.recipe.ref, contentHash: run.recipe.contentHash },
    limits: run.limits,
    params,
  };
}

/**
 * What the seven steps of one stage share. Every value is cached when a step produces it and
 * re-read from the run folder otherwise, so a run resumed at any step (R1-08) finds the brief,
 * the input manifest and the resolved assets without redoing earlier steps.
 */
export class StageWorkspace {
  private brief: StageBrief | null = null;
  private inputManifest: StageInputManifest | null = null;
  private boundAssets: readonly BoundAsset[] | null = null;
  /** Params after a `retry-with-params` patch, or as the last snapshot recorded them on resume. */
  private paramsInForce: JsonObject | null = null;
  /** `preflight` passed the cost ceilings in this execution for the params in force. */
  private costChecked = false;

  constructor(private readonly options: StageWorkspaceOptions) {}

  get active(): ActiveRun {
    return this.options.active;
  }

  get runDir(): string {
    return this.options.active.runDir;
  }

  get location(): StageLocation {
    return this.options.location;
  }

  get executor(): StageExecutorPort {
    return this.options.executor;
  }

  get resolver(): AssetResolverPort {
    return this.options.resolver;
  }

  /** The recipe's entry for this stage; a stage absent from the graph runs with no params or checks. */
  recipeStage(): RecipeStage | undefined {
    return recipeStageOf(this.options.active.snapshot, this.options.location.stageId);
  }

  recipeParams(): JsonObject {
    return this.recipeStage()?.params ?? {};
  }

  /** StagePlanningContext `params`: the recipe params with any patch the engine applied (C6). */
  planningContext(): StagePlanningContext {
    return planningContextFor(this.options.active.snapshot, this.options.location, this.paramsInForce ?? this.recipeParams());
  }

  /** New params invalidate the cost check: their estimate was never compared with the ceilings. */
  useParams(params: JsonObject): void {
    this.paramsInForce = params;
    this.costChecked = false;
  }

  markCostChecked(): void {
    this.costChecked = true;
  }

  /** Whether `preflight` checked the cost ceilings in this execution for the params in force. */
  get costCheckedForParams(): boolean {
    return this.costChecked;
  }

  rememberBrief(brief: StageBrief): void {
    this.brief = brief;
  }

  rememberInputManifest(manifest: StageInputManifest): void {
    this.inputManifest = manifest;
  }

  rememberBoundAssets(assets: readonly BoundAsset[]): void {
    this.boundAssets = assets;
  }

  async stageBrief(): Promise<StageBrief> {
    this.brief ??= await readStageBrief(this.runDir, this.location);
    return this.brief;
  }

  async stageInputManifest(): Promise<StageInputManifest> {
    this.inputManifest ??= await readStageInputManifest(this.runDir, this.location);
    return this.inputManifest;
  }

  /**
   * Adds the models an `execute` attempt reported to `input-manifest.json` (SPEC 0002 rev 3);
   * `snapshot` cannot know them. Rewritten through C5 only when the list grows.
   */
  async recordModelsUsed(models: readonly ModelUse[]): Promise<void> {
    const manifest = await this.stageInputManifest();
    const merged = mergeModelUses(manifest.models, models);
    if (merged.length === manifest.models.length) return;
    const next: StageInputManifest = { ...manifest, models: merged };
    await writeStageInputManifest(this.runDir, next);
    this.inputManifest = next;
  }

  /** Bindings resolved earlier in this execution, without re-hashing; null before preflight or snapshot ran. */
  cachedBindings(): readonly BoundAsset[] | null {
    return this.boundAssets;
  }

  /** Resolved bindings with their slots; re-resolved (and re-hashed) when not cached. */
  async resolvedBindings(signal: AbortSignal): Promise<readonly BoundAsset[]> {
    if (this.boundAssets !== null) return this.boundAssets;
    const resolution = await resolveBoundAssets(this.resolver, this.active.snapshot, signal);
    if (resolution.problems.length > 0) throw new BoundAssetUnavailableError(resolution.problems);
    this.boundAssets = resolution.assets;
    return resolution.assets;
  }

  async resolvedAssets(signal: AbortSignal): Promise<readonly ResolvedAsset[]> {
    return (await this.resolvedBindings(signal)).map((bound) => bound.asset);
  }
}
