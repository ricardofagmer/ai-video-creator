import type { StageFailure } from '@studio/shared/ports';
import {
  type CheckId,
  type ControlRequest,
  type JsonObject,
  type RecoveryRecord,
  type RunEvent,
  type StepKey,
  type StepName,
  type WaitingCause,
} from '@studio/shared/run-format';
import { type StageWorkspace } from './stage-workspace';

/**
 * How a step failed, as the engine sees it. `executor` is the executor's own failure report,
 * `postcondition` an engine check the step did not meet, `checks` the `verify` checks that failed
 * (so a never-retried check such as `claims-evidence` is recognised), `guard` a never-retried
 * condition (cost ceiling, licence doubt) found by a preflight check (PRD 7.3).
 */
export type StepFailure =
  | { origin: 'executor'; failure: StageFailure }
  | { origin: 'postcondition'; postcondition: string; detail: string }
  | { origin: 'checks'; postcondition: string; failedChecks: readonly CheckId[]; detail: string }
  | { origin: 'guard'; cause: WaitingCause; reason: string; whatToDo: string };

export interface StepFailureContext {
  workspace: StageWorkspace;
  step: StepName;
  attempt: number;
  stepKey: StepKey;
  failure: StepFailure;
  /** Aborted by `stop`, the Recovery call timeout or a run-level abort. */
  signal: AbortSignal;
}

/** A Recovery call the engine records on the failed step, whatever it decides next. */
export type RecoveryNote = Omit<RecoveryRecord, 'number'>;

/**
 * What the engine does next (PRD 7.3, K3). `retry` reruns the stage from `restartAt` (the failed
 * step itself, or an earlier step whose output the failed step judged) with an optional params
 * patch; `rerun-stage` reopens every stage from `fromStageNumber` up to the failing one. The engine
 * enforces `limits.attemptsPerStep` itself, whatever the policy answers.
 */
export type StepFailureDecision =
  | { kind: 'fail-run'; reason: string; recovery: RecoveryNote | null }
  | { kind: 'wait'; cause: WaitingCause; reason: string; whatToDo: string; recovery: RecoveryNote | null }
  | { kind: 'retry'; restartAt: StepName; paramsPatch: JsonObject | null; detail: string; recovery: RecoveryNote | null }
  | { kind: 'rerun-stage'; fromStageNumber: number; detail: string; recovery: RecoveryNote };

/**
 * Failure handling seam (token `STEP_FAILURE_POLICY`). The engine module binds the R1-08
 * `RecoveryPolicy` by default: verify repeat, one Recovery call per failed attempt, per-stage
 * recovery bound and the never-retried classes.
 */
export interface StepFailurePolicy {
  decide(context: StepFailureContext): Promise<StepFailureDecision>;
}

export type PreflightVerdict = { status: 'passed'; detail: string } | { status: 'failed'; failure: StepFailure };

/**
 * Extra `preflight` checks (token `PREFLIGHT_CHECKS`), run after the built-in licence guard and
 * cost ceilings. The composition root adds its checks here (R1-06 asset re-hash); the built-ins do
 * not depend on this binding, so overriding it never removes them.
 */
export interface PreflightCheck {
  readonly name: string;
  check(workspace: StageWorkspace, signal: AbortSignal): Promise<PreflightVerdict>;
}

export type ControlRequestKind = Extract<RunEvent, { type: 'control.request' }>['request'];

export type ControlDirective = { kind: 'continue' } | { kind: 'pause' } | { kind: 'stop'; reason: string };

/** `control.json` as the engine reads it: the directive in force and the flags it carried. */
export interface ControlState {
  directive: ControlDirective;
  resume: boolean;
  requests: readonly ControlRequestKind[];
  /** The request as read, null when the file was absent; `clear` deletes only this one. */
  request: ControlRequest | null;
}

/**
 * Request channel from the api or CLI (token `RUN_CONTROL`). The engine module binds the
 * `control.json` channel by default (ADR 0003, SPEC 0002 A6).
 */
export interface RunControlChannel {
  /** An absent file reads as `continue` with no flags. */
  read(runDir: string): Promise<ControlState>;
  /**
   * Deletes the request file once the execution owns the run (RUN-FORMAT section 12), but only
   * while it still holds the request `read` carried: a request written after that read survives.
   */
  clear(runDir: string, read: ControlState): Promise<void>;
}
