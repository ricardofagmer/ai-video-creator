import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  NEEDS_PERSON_ACTION,
  RECOVERY_ROLE,
  RERUN_PREVIOUS_STAGE_ACTION,
  RETRY_STEP_ACTION,
  RETRY_WITH_PARAMS_ACTION,
  type AgentsPort,
  type RecoveryAction,
  type RecoveryActionKind,
} from '@studio/shared/agents';
import { type WaitingCause } from '@studio/shared/run-format';
import { type Clock } from '../clock';
import { BoundAssetUnavailableError } from '../engine.errors';
import { AGENTS, CLOCK } from '../engine.tokens';
import { ownerTexts, postconditions } from '../owner-texts';
import { type BoundAsset } from '../postconditions/asset-resolution';
import { biometricStages, boundBiometricAsset } from '../postconditions/asset-guards';
import { MAX_RECOVERY_RECORDS_PER_STEP } from '../run-budget';
import { type RecoveryNote, type StepFailureContext, type StepFailureDecision, type StepFailurePolicy } from '../seams';
import { failureText } from './failure-text';
import {
  allowedRecoveryActions,
  checkParamsPatch,
  rerunTargetFor,
  retryRestartStep,
  type RerunScope,
} from './recovery-allowlist';
import { buildRecoveryPacket } from './recovery-packet';

interface RecoveryAnswer {
  action: RecoveryAction;
  allowed: readonly RecoveryActionKind[];
  rerun: RerunScope;
  note: RecoveryNote;
}

function nonEmpty(text: string, fallback: string): string {
  return text.trim() === '' ? fallback : text;
}

function failRun(context: StepFailureContext, cause: string, recovery: RecoveryNote | null = null): StepFailureDecision {
  const { stageNumber, stageId } = context.workspace.location;
  return { kind: 'fail-run', reason: ownerTexts.stepFailed(stageNumber, stageId, context.step, cause), recovery };
}

function wait(cause: WaitingCause, texts: { reason: string; whatToDo: string }, recovery: RecoveryNote | null = null): StepFailureDecision {
  return {
    kind: 'wait',
    cause,
    reason: nonEmpty(texts.reason, ownerTexts.recoveryDefaultWhatToDo),
    whatToDo: nonEmpty(texts.whatToDo, ownerTexts.recoveryDefaultWhatToDo),
    recovery,
  };
}

/**
 * Default `STEP_FAILURE_POLICY` (PRD 7.3, topology sections 7 and 9, SPEC 0002 K3, A7). In order:
 * 1. never retried: guard failures (cost ceiling, licence doubt), authentication errors, executor
 *    `needs-person` causes, failed `claims-evidence`, any failure of a stage that reads a bound
 *    biometric asset -> `waiting`, no Recovery call;
 * 2. `limits.attemptsPerStep` spent, or the same error after a recovery -> run `failed`;
 * 3. the first `verify` failure repeats the checks once, without Recovery;
 * 4. otherwise one Recovery call for this failed attempt, bounded per stage by
 *    `limits.recoveriesPerStage`; its action is applied only when the step allowlist permits it.
 */
@Injectable()
export class RecoveryPolicy implements StepFailurePolicy {
  private readonly logger = new Logger(RecoveryPolicy.name);

  constructor(
    @Inject(AGENTS) private readonly agents: AgentsPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async decide(context: StepFailureContext): Promise<StepFailureDecision> {
    const neverRetried = await this.neverRetried(context);
    if (neverRetried !== null) return neverRetried;
    const exhausted = this.exhausted(context);
    if (exhausted !== null) return exhausted;
    if (context.step === 'verify' && this.attemptsUsed(context) === 1) {
      return { kind: 'retry', restartAt: 'verify', paramsPatch: null, detail: ownerTexts.verifyRepeat, recovery: null };
    }
    return this.recover(context);
  }

  private async neverRetried(context: StepFailureContext): Promise<StepFailureDecision | null> {
    const { failure } = context;
    if (failure.origin === 'guard') return wait(failure.cause, failure);
    if (failure.origin === 'executor' && failure.failure.class === 'authentication') {
      const provider = failure.failure.provider;
      return wait(
        { kind: 'authentication', provider },
        { reason: ownerTexts.authenticationReason(provider), whatToDo: ownerTexts.authenticationWhatToDo(provider) },
      );
    }
    if (failure.origin === 'executor' && failure.failure.class === 'needs-person') {
      return wait(failure.failure.cause, { reason: failure.failure.message, whatToDo: failure.failure.whatToDo });
    }
    if (failure.origin === 'checks' && failure.failedChecks.includes('claims-evidence')) {
      // The claim ids live in the verify stage's own artifact; the stage executor reports them as a
      // `claim-without-evidence` cause when it knows them. Here only the step is known.
      return wait(
        { kind: 'needs-person', stepKey: context.stepKey },
        { reason: ownerTexts.claimsWithoutEvidenceReason, whatToDo: ownerTexts.claimsWithoutEvidenceWhatToDo },
      );
    }
    return this.biometricHold(context);
  }

  private async biometricHold(context: StepFailureContext): Promise<StepFailureDecision | null> {
    if (!biometricStages.includes(context.workspace.location.stageId)) return null;
    const biometric = boundBiometricAsset((await this.bindingsOf(context)) ?? []);
    if (biometric === undefined) return null;
    const ref = biometric.asset.ref;
    return wait(
      { kind: 'biometric-asset', ref },
      { reason: ownerTexts.biometricReason(ref, failureText(context.failure)), whatToDo: ownerTexts.biometricWhatToDo },
    );
  }

  private exhausted(context: StepFailureContext): StepFailureDecision | null {
    const { active, location } = context.workspace;
    const limit = active.snapshot.limits.attemptsPerStep;
    const text = failureText(context.failure);
    if (this.attemptsUsed(context) >= limit) return failRun(context, `${ownerTexts.attemptsExhausted(limit)}; ${text}`);
    const record = active.stepRecord(location.stageNumber, context.step);
    const lastRecovery = active.budget.recoveriesSince(location.stageNumber, record).at(-1);
    if (lastRecovery !== undefined && lastRecovery.error === text) return failRun(context, ownerTexts.sameErrorAfterRecovery(text));
    return null;
  }

  private attemptsUsed(context: StepFailureContext): number {
    const { active, location } = context.workspace;
    return active.budget.attemptsUsed(location.stageNumber, active.stepRecord(location.stageNumber, context.step));
  }

  private async recover(context: StepFailureContext): Promise<StepFailureDecision> {
    const { workspace, step, attempt, stepKey } = context;
    const { active, location } = workspace;
    const limit = active.snapshot.limits.recoveriesPerStage;
    const record = active.stepRecord(location.stageNumber, step);
    if (active.budget.stageRecoveriesUsed(active.stage(location.stageNumber)) >= limit || record.recoveries.length >= MAX_RECOVERY_RECORDS_PER_STEP) {
      return failRun(context, `${ownerTexts.recoveriesExhausted(limit)}; ${failureText(context.failure)}`);
    }

    const text = failureText(context.failure);
    const bindings = (await this.bindingsOf(context)) ?? [];
    const rerun: RerunScope = {
      run: active.snapshot,
      currentStageNumber: location.stageNumber,
      biometricBound: boundBiometricAsset(bindings) !== undefined,
    };
    const allowed = allowedRecoveryActions({ step, recipeParams: workspace.recipeParams(), rerun });
    const packet = buildRecoveryPacket({
      runId: active.snapshot.runId,
      stageId: location.stageId,
      step,
      attempt,
      postcondition: postconditions[step],
      failureReason: text,
      allowedActions: allowed,
    });

    let action: RecoveryAction;
    try {
      action = await this.agents.run(RECOVERY_ROLE, packet, { signal: context.signal });
    } catch (error) {
      // Topology section 9: a failed Recovery call sends the run to `waiting`, like `needs-person`.
      this.logger.warn(`Recovery call for ${stepKey} failed: ${error instanceof Error ? error.name : typeof error}`);
      return wait(
        { kind: 'agent-failed', role: RECOVERY_ROLE, stepKey },
        { reason: ownerTexts.stepFailed(location.stageNumber, location.stageId, step, text), whatToDo: ownerTexts.recoveryFailedWhatToDo },
      );
    }
    const note: RecoveryNote = {
      sessionId: null,
      attempt,
      error: text,
      cause: action.cause,
      whatWasDone: action.whatWasDone,
      actionKind: action.action.kind,
      resolved: action.resolved,
      needsPerson: action.needsPerson,
      // AgentsPort returns no usage; the call's cost reaches the step through cost.json at `record`.
      costUsd: 0,
      at: this.clock.now().toISOString(),
    };
    return this.applyAction(context, { action, allowed, rerun, note });
  }

  private applyAction(context: StepFailureContext, answer: RecoveryAnswer): StepFailureDecision {
    const { action, allowed, rerun, note } = answer;
    const kind = action.action.kind;
    if (!allowed.includes(kind)) return this.refuse(context, answer);
    if (action.needsPerson) return this.needsPerson(context, answer, { ...note, actionKind: NEEDS_PERSON_ACTION });

    const applied = ownerTexts.recoveryApplied(kind);
    switch (action.action.kind) {
      case NEEDS_PERSON_ACTION:
        return this.needsPerson(context, answer, note);
      case RETRY_STEP_ACTION:
        return { kind: 'retry', restartAt: retryRestartStep(context.step, RETRY_STEP_ACTION), paramsPatch: null, detail: applied, recovery: note };
      case RETRY_WITH_PARAMS_ACTION: {
        const { workspace } = context;
        const verdict = checkParamsPatch({
          current: workspace.planningContext().params,
          recipeParams: workspace.recipeParams(),
          patch: action.action.params,
        });
        if (verdict.status === 'refused') return this.refuse(context, answer);
        return {
          kind: 'retry',
          restartAt: retryRestartStep(context.step, RETRY_WITH_PARAMS_ACTION),
          paramsPatch: verdict.params,
          detail: applied,
          recovery: note,
        };
      }
      case RERUN_PREVIOUS_STAGE_ACTION: {
        const target = rerunTargetFor(rerun, action.action.stageId);
        if (target === undefined) return this.refuse(context, answer);
        const current = context.workspace.location.stageNumber;
        return { kind: 'rerun-stage', fromStageNumber: target, detail: ownerTexts.stagesRerun(target, current), recovery: note };
      }
    }
  }

  /** An action outside the allowlist, a params patch or a rerun target the engine refuses: nothing is applied. */
  private refuse(context: StepFailureContext, answer: RecoveryAnswer): StepFailureDecision {
    const refused: RecoveryNote = {
      ...answer.note,
      actionKind: NEEDS_PERSON_ACTION,
      resolved: false,
      needsPerson: true,
      whatWasDone: ownerTexts.recoveryRefused(answer.action.action.kind),
    };
    return this.needsPerson(context, answer, refused);
  }

  private needsPerson(context: StepFailureContext, answer: RecoveryAnswer, note: RecoveryNote): StepFailureDecision {
    const { stageNumber, stageId } = context.workspace.location;
    return wait(
      { kind: 'needs-person', stepKey: context.stepKey },
      { reason: ownerTexts.stepFailed(stageNumber, stageId, context.step, note.error), whatToDo: answer.action.whatToDo },
      note,
    );
  }

  /** Bindings of the run without a second re-hash when preflight or snapshot already resolved them. */
  private async bindingsOf(context: StepFailureContext): Promise<readonly BoundAsset[] | null> {
    const cached = context.workspace.cachedBindings();
    if (cached !== null) return cached;
    try {
      return await context.workspace.resolvedBindings(context.signal);
    } catch (error) {
      // An unresolvable binding is the failure being handled (`preflight`); nothing biometric ran.
      if (error instanceof BoundAssetUnavailableError) return null;
      throw error;
    }
  }
}
