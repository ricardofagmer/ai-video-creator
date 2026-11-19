import {
  NEEDS_PERSON_ACTION,
  RERUN_PREVIOUS_STAGE_ACTION,
  RETRY_STEP_ACTION,
  RETRY_WITH_PARAMS_ACTION,
  type RecoveryActionKind,
  type StepParamsPatch,
} from '@studio/shared/agents';
import { stepOrder, type JsonObject, type RunFile, type StageId, type StepName } from '@studio/shared/run-format';
import { biometricStages } from '../postconditions/asset-guards';

/**
 * Per-step `RecoveryAction` allowlist (SPEC 0002 rev 2: drafted by R1-08 and returned to the owner;
 * accepted as the recommended draft under the owner's standing instruction). Narrowest that still
 * lets Recovery fix something:
 * - `needs-person` everywhere.
 * - `retry-step` where a rerun has no external effect beyond the step's own output: the
 *   deterministic steps and `preflight` (read-only re-hash), plus `execute` and `verify`, whose
 *   paid calls stay inside the attempt bound and the cost ceilings.
 * - `retry-with-params` only on `execute` and `verify`: the stage executor is the only consumer of
 *   recipe stage params.
 * - `rerun-previous-stage` only on `execute` and `verify`, where a bad upstream artifact shows up.
 * A `verify` retry reruns from `execute` (the checks judge its output; checks alone were already
 * repeated once). The engine narrows the list further per call (`allowedRecoveryActions`).
 */
export const recoveryActionAllowlist: Readonly<Record<StepName, readonly RecoveryActionKind[]>> = {
  brief: [RETRY_STEP_ACTION, NEEDS_PERSON_ACTION],
  preflight: [RETRY_STEP_ACTION, NEEDS_PERSON_ACTION],
  snapshot: [RETRY_STEP_ACTION, NEEDS_PERSON_ACTION],
  execute: [RETRY_STEP_ACTION, RETRY_WITH_PARAMS_ACTION, RERUN_PREVIOUS_STAGE_ACTION, NEEDS_PERSON_ACTION],
  verify: [RETRY_STEP_ACTION, RETRY_WITH_PARAMS_ACTION, RERUN_PREVIOUS_STAGE_ACTION, NEEDS_PERSON_ACTION],
  archive: [RETRY_STEP_ACTION, NEEDS_PERSON_ACTION],
  record: [RETRY_STEP_ACTION, NEEDS_PERSON_ACTION],
};

/** Where a retry of a failed step restarts the stage. */
export function retryRestartStep(failedStep: StepName, kind: typeof RETRY_STEP_ACTION | typeof RETRY_WITH_PARAMS_ACTION): StepName {
  // A params patch must reach the input manifest, so `snapshot` records the params the rerun uses.
  if (kind === RETRY_WITH_PARAMS_ACTION) return 'snapshot';
  return failedStep === 'verify' ? 'execute' : failedStep;
}

/** Settled steps between `restartAt` and the failed step, which a retry reopens. */
export function stepsToReopen(restartAt: StepName, failedStep: StepName): StepName[] {
  const from = stepOrder.indexOf(restartAt);
  const to = stepOrder.indexOf(failedStep);
  return stepOrder.slice(from, Math.max(from, to));
}

/**
 * Recipe params a `retry-with-params` patch may change: keys the recipe already sets to a number or
 * a boolean. Strings are excluded because they can name an asset, a voice or a path.
 */
export function tunableParamKeys(recipeParams: JsonObject): string[] {
  return Object.entries(recipeParams)
    .filter(([, value]) => typeof value === 'number' || typeof value === 'boolean')
    .map(([key]) => key);
}

export type ParamsPatchVerdict = { status: 'accepted'; params: JsonObject } | { status: 'refused'; keys: string[] };

export function checkParamsPatch(input: { current: JsonObject; recipeParams: JsonObject; patch: StepParamsPatch }): ParamsPatchVerdict {
  const tunable = new Set(tunableParamKeys(input.recipeParams));
  const refused = Object.entries(input.patch)
    .filter(([key, value]) => !tunable.has(key) || typeof value !== typeof input.recipeParams[key])
    .map(([key]) => key);
  if (refused.length > 0) return { status: 'refused', keys: refused };
  return { status: 'accepted', params: { ...input.current, ...input.patch } };
}

export interface RerunScope {
  run: Readonly<RunFile>;
  currentStageNumber: number;
  /** A biometric asset is bound to the run: no rerun may reach a stage that reads it. */
  biometricBound: boolean;
}

function gatedStages(run: Readonly<RunFile>): Set<StageId> {
  return new Set<StageId>(['plan', ...run.recipe.definition.gates.map((gate) => gate.afterStage)]);
}

/**
 * Stages `rerun-previous-stage` may reopen: delivered, upstream of the failing stage, not `plan`,
 * with no human gate between them and the failing stage (an approved gate must never be passed
 * again with different content) and no biometric stage in the range while a biometric asset is
 * bound (PRD 7.3).
 */
export function rerunTargets(scope: RerunScope): number[] {
  const { run, currentStageNumber } = scope;
  const gated = gatedStages(run);
  const targets: number[] = [];
  for (let number = currentStageNumber - 1; number >= 1; number -= 1) {
    const stage = run.stages[number - 1];
    if (stage === undefined || stage.stageId === 'plan' || gated.has(stage.stageId)) break;
    if (scope.biometricBound && biometricStages.includes(stage.stageId)) break;
    if (stage.outcome.status === 'delivered') targets.push(number);
  }
  return targets;
}

export function rerunTargetFor(scope: RerunScope, stageId: StageId): number | undefined {
  return rerunTargets(scope).find((number) => scope.run.stages[number - 1]?.stageId === stageId);
}

/** The step's allowlist, minus kinds that cannot apply to this stage right now. */
export function allowedRecoveryActions(input: { step: StepName; recipeParams: JsonObject; rerun: RerunScope }): RecoveryActionKind[] {
  return recoveryActionAllowlist[input.step].filter((kind) => {
    if (kind === RETRY_WITH_PARAMS_ACTION) return tunableParamKeys(input.recipeParams).length > 0;
    if (kind === RERUN_PREVIOUS_STAGE_ACTION) return rerunTargets(input.rerun).length > 0;
    return true;
  });
}
