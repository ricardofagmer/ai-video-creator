import type { CorrelationId, RunId } from '../common/ids';
import type { JsonObject } from '../common/json';
import type { Brief } from '../recipes/brief';
import type { Recipe, RecipePin } from '../recipes/recipe';
import type { StageLocation } from '../run-format/layout';
import type { Limits } from '../run-format/limits';
import type { Activity } from '../run-format/now';
import type { WaitingCause } from '../run-format/run-state';
import type { CheckResult, DeclaredOutput, ModelUse, StageBrief, StageInputManifest } from '../run-format/stage-files';
import type { StageEstimate } from '../run-format/stage-record';
import type { StepKey } from '../run-format/step-key';
import type { ProviderName, StageId } from '../run-format/vocabulary';
import type { ResolvedAsset } from './asset-resolver';
import type { StageEventSink } from './stage-events';

/** What the engine knows before a stage runs: enough to render its brief and estimate it. */
export interface StagePlanningContext {
  runId: RunId;
  stage: StageLocation;
  brief: Brief;
  recipe: Recipe;
  /** The run's pinned recipe version, as frozen in run.json (`recipe.ref`, `recipe.contentHash`). */
  recipePin: RecipePin;
  limits: Limits;
  /** The recipe stage `params`, with any `retry-with-params` patch the engine applied. */
  params: JsonObject;
}

export interface StageExecutionContext extends StagePlanningContext {
  /** Absolute run folder; executors write only their declared outputs inside it. */
  runDir: string;
  attempt: number;
  stepKey: StepKey;
  stageBrief: StageBrief;
  inputManifest: StageInputManifest;
  assets: readonly ResolvedAsset[];
  correlationId: CorrelationId | null;
  /** Step timeout and `stop` requests; propagated to every model call and tool, ffmpeg included. */
  signal: AbortSignal;
  /** Live activity for now.json; text must already be redacted. */
  report: (activity: Omit<Activity, 'atMs'>) => void;
  /** `session.*` and `review.verdict` events; the engine writes them to `events.jsonl` (C5). */
  events: StageEventSink;
}

/**
 * How a step failed, after the executor's own retries. `retryable` failures go through the
 * engine's attempts and Recovery; the other two never get a Recovery call (PRD 7.3).
 */
export type StageFailure =
  | { class: 'retryable'; kind: 'tool' | 'timeout' | 'rate-limit' | 'invalid-output'; message: string }
  | { class: 'authentication'; provider: ProviderName; message: string }
  | { class: 'needs-person'; cause: WaitingCause; message: string; whatToDo: string };

/**
 * The executor's own account of `execute`. `reported-success` is a claim, not a verdict: the
 * engine still checks every declared output and runs `verify` (criterion 11). Both outcomes name
 * the models the attempt called (empty when none); the engine records them in the stage input
 * manifest.
 */
export type StageExecutionResult =
  | { status: 'reported-success'; summary: string; models: readonly ModelUse[] }
  | { status: 'failed'; failure: StageFailure; models: readonly ModelUse[] };

/** One implementation per stage of SPEC 0002 A5 (R1-14); mock implementations in R1-04. */
export interface StageExecutorPort {
  readonly stageId: StageId;
  /** Preflight estimate; no side effects and no paid call. */
  estimate(context: StagePlanningContext): Promise<StageEstimate>;
  /**
   * Files `execute` must leave non-empty; rendered into the stage brief at step `brief`. Rev 4
   * (SPEC 0002 section 13.6): an output with `optional: true` may be absent after `execute`, but
   * when present it must be a non-empty regular file; absent or `false` means required. Signature
   * unchanged.
   */
  declaredOutputs(context: StagePlanningContext): readonly DeclaredOutput[];
  execute(context: StageExecutionContext): Promise<StageExecutionResult>;
  /** `verify`-step checks as evidence; the engine decides pass from their outcomes. */
  verify(context: StageExecutionContext): Promise<readonly CheckResult[]>;
}
