import { Inject, Injectable } from '@nestjs/common';
import { RECOVERY_ROLE, agentBounds } from '@studio/shared/agents';
import { type RunStatus, type StepKey } from '@studio/shared/run-format';
import { type StepPosition } from '../active-run';
import { type Clock } from '../clock';
import { RunControlService } from '../control/run-control.service';
import { StepInterruptedError } from '../engine.errors';
import { CLOCK, STEP_FAILURE_POLICY } from '../engine.tokens';
import { ownerTexts } from '../owner-texts';
import { appendRecovery, reopenSteps, resetStages } from '../run-mutations';
import { type RecoveryNote, type StepFailure, type StepFailureDecision, type StepFailurePolicy } from '../seams';
import { type StageWorkspace } from '../stage-workspace';
import { clip, textLimits } from '../text';
import { stepsToReopen } from './recovery-allowlist';

/** `retry` keeps running this stage; `restart` reruns earlier stages; `held` ends the execution. */
export type FailureResolution = { kind: 'retry' } | { kind: 'restart' } | { kind: 'held'; status: RunStatus };

export interface FailedStep {
  workspace: StageWorkspace;
  position: StepPosition;
  stepKey: StepKey;
  failure: StepFailure;
  detail: string;
}

type Decided = { kind: 'decided'; decision: StepFailureDecision } | { kind: 'threw'; error: unknown };

/**
 * Applies the failure policy to one failed step attempt (PRD 7.3, K3). The policy, and its Recovery
 * call, run under their own `StepGuard`: the Recovery budget timeout, a `stop` and the run cost
 * ceiling still apply while the engine decides. Every Recovery call is recorded on the failed step
 * and as a `step.recovery` event before the decision takes effect.
 */
@Injectable()
export class StepFailureHandler {
  constructor(
    @Inject(STEP_FAILURE_POLICY) private readonly policy: StepFailurePolicy,
    @Inject(RunControlService) private readonly runControl: RunControlService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async handle(failed: FailedStep): Promise<FailureResolution> {
    const { workspace, position, stepKey } = failed;
    const active = workspace.active;
    const guard = this.runControl.guard(active, agentBounds[RECOVERY_ROLE].timeoutMs);
    let decided: Decided;
    try {
      const decision = await this.policy.decide({
        workspace,
        step: position.step,
        attempt: position.attempt,
        stepKey,
        failure: failed.failure,
        signal: guard.signal,
      });
      decided = { kind: 'decided', decision };
    } catch (error) {
      decided = { kind: 'threw', error };
    }
    guard.close();

    // A stop or the run ceiling overrides whatever the policy answered while they arrived.
    const interruption = guard.interruption;
    if (interruption?.kind === 'stop') {
      await active.endStep(position, 'pending', `${failed.detail} ${ownerTexts.stopRequested}`);
      return this.runControl.interrupt(active, interruption.reason);
    }
    if (interruption?.kind === 'cost-ceiling') {
      await active.endStep(position, 'pending', failed.detail);
      return this.runControl.waitForCost(active, { spentUsd: interruption.spentUsd, limitUsd: interruption.limitUsd, stepKey });
    }
    // Like a crash: the failed step stays as it is and the next start resumes it (R1-09, criterion 13).
    if (interruption?.kind === 'shutdown') return this.runControl.releaseForShutdown(active);
    if (decided.kind === 'threw') throw decided.error;
    if (interruption?.kind === 'run-aborted') throw new StepInterruptedError('run-aborted');
    return this.apply(failed, decided.decision);
  }

  private async apply(failed: FailedStep, decision: StepFailureDecision): Promise<FailureResolution> {
    const { workspace, position, stepKey } = failed;
    const active = workspace.active;
    if (decision.recovery !== null) await this.recordRecovery(failed, decision.recovery);

    switch (decision.kind) {
      case 'retry': {
        await active.endStep(position, 'failed', `${failed.detail} ${decision.detail}`);
        const steps = stepsToReopen(decision.restartAt, position.step);
        if (steps.length > 0) await active.apply((run) => reopenSteps(run, position.stageNumber, steps, ownerTexts.stepReopened));
        if (decision.paramsPatch !== null) workspace.useParams(decision.paramsPatch);
        return { kind: 'retry' };
      }
      case 'rerun-stage': {
        await active.endStep(position, 'failed', `${failed.detail} ${decision.detail}`);
        const range = { fromStageNumber: decision.fromStageNumber, toStageNumber: position.stageNumber };
        await active.apply((run) => resetStages(run, range, ownerTexts.stepReopened));
        await active.emit({ type: 'log', level: 'warning', text: decision.detail, stepKey });
        return { kind: 'restart' };
      }
      case 'wait': {
        // The step goes back to `pending` so a resumed run starts it again with attempt + 1.
        await active.endStep(position, 'pending', failed.detail);
        await active.setState(
          {
            status: 'waiting',
            since: this.now(),
            cause: decision.cause,
            reason: clip(decision.reason, textLimits.ownerText),
            whatToDo: clip(decision.whatToDo, textLimits.ownerText),
          },
          stepKey,
        );
        return { kind: 'held', status: 'waiting' };
      }
      case 'fail-run': {
        await active.endStep(position, 'failed', failed.detail);
        await active.setState({ status: 'failed', since: this.now(), reason: clip(decision.reason, textLimits.ownerText), stepKey }, stepKey);
        return { kind: 'held', status: 'failed' };
      }
    }
  }

  private async recordRecovery(failed: FailedStep, note: RecoveryNote): Promise<void> {
    const { workspace, position, stepKey } = failed;
    const active = workspace.active;
    const recovery = await active.apply((run) => appendRecovery(run, { stageNumber: position.stageNumber, step: position.step }, note));
    await active.emit({
      type: 'step.recovery',
      level: recovery.resolved ? 'info' : 'warning',
      text: ownerTexts.recoveryRecorded(position.stageNumber, position.stageId, position.step, recovery.actionKind),
      stepKey,
      actionKind: recovery.actionKind,
      resolved: recovery.resolved,
      needsPerson: recovery.needsPerson,
    });
  }

  private now(): string {
    return this.clock.now().toISOString();
  }
}
