import type { StageExecutionContext, StageExecutionResult, StageFailure } from '@studio/shared/ports';
import { type CheckId, type CheckResult, type ModelUse, type WaitingCause } from '@studio/shared/run-format';
import { clip } from '../../engine/text';
import { stageTexts } from './stage-texts';
import { type ToolRunOutcome } from '../process/tool-runner.client';

/** C3 `StageInputManifest.models` holds at most ten entries. */
const MAX_MODELS = 10;

export interface CheckEvidence {
  outcome: CheckResult['outcome'];
  expected: string;
  measured: string;
  detail: string;
}

export type CheckEvidenceMap = ReadonlyMap<CheckId, CheckEvidence>;

export function checkResult(context: StageExecutionContext, checkId: CheckId, evidence: CheckEvidence, startedAtMs: number, durationMs: number): CheckResult {
  return {
    checkId,
    stageNumber: context.stage.stageNumber,
    stageId: context.stage.stageId,
    attempt: context.attempt,
    outcome: evidence.outcome,
    expected: clip(evidence.expected, 500),
    measured: clip(evidence.measured, 500),
    detail: clip(evidence.detail, 2000),
    startedAtMs,
    durationMs,
    rawOutputPath: null,
  };
}

function uniqueModels(models: readonly ModelUse[]): ModelUse[] {
  const unique: ModelUse[] = [];
  for (const model of models) {
    if (!unique.some((known) => known.role === model.role && known.modelId === model.modelId)) unique.push(model);
  }
  return unique.slice(0, MAX_MODELS);
}

export function reportedSuccess(summary: string, models: readonly ModelUse[] = []): StageExecutionResult {
  return { status: 'reported-success', summary: clip(summary, 500), models: uniqueModels(models) };
}

export function stageFailed(failure: StageFailure, models: readonly ModelUse[] = []): StageExecutionResult {
  return { status: 'failed', failure, models: uniqueModels(models) };
}

export function needsPerson(cause: WaitingCause, message: string, whatToDo: string): StageFailure {
  return { class: 'needs-person', cause, message: clip(message, 2000), whatToDo: clip(whatToDo, 2000) };
}

/** A tool runner failure as a C6 failure: blocked targets go to the owner, the rest retry. */
export function toolFailure(outcome: Extract<ToolRunOutcome<unknown>, { status: 'failed' }>, context: StageExecutionContext): StageFailure {
  if (outcome.kind === 'blocked') {
    return needsPerson({ kind: 'needs-person', stepKey: context.stepKey }, stageTexts.captureBlocked, stageTexts.captureBlockedWhatToDo);
  }
  if (outcome.kind === 'timeout') return { class: 'retryable', kind: 'timeout', message: stageTexts.toolTimedOut(outcome.message) };
  return { class: 'retryable', kind: 'tool', message: stageTexts.toolFailed(outcome.message) };
}

/** `recipeStage.timeoutMs` when the recipe sets one, else `limits.commandTimeoutMs` (SPEC 0002 A7). */
export function commandTimeoutMs(context: StageExecutionContext): number {
  const recipeStage = context.recipe.graph.stages.find((stage) => stage.stageId === context.stage.stageId);
  return recipeStage?.timeoutMs ?? context.limits.commandTimeoutMs;
}
