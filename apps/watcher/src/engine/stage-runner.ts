import { Inject, Injectable } from '@nestjs/common';
import type { AssetResolverPort } from '@studio/shared/ports';
import { formatStepKey, stepOrder, type RunStatus, type StepKey, type StepName, type StepStatus } from '@studio/shared/run-format';
import { type ActiveRun, type StepPosition } from './active-run';
import { type Clock } from './clock';
import { RunControlService } from './control/run-control.service';
import { type StepInterruption } from './control/step-guard';
import { StepInterruptedError } from './engine.errors';
import { ASSET_RESOLVER, CLOCK } from './engine.tokens';
import { ExecutorRegistry } from './executor-registry';
import { StepFailureHandler } from './failure/step-failure.handler';
import { ownerTexts } from './owner-texts';
import { type StepFailure } from './seams';
import { StageWorkspace } from './stage-workspace';
import { type StepOutcome } from './steps/step-handler';
import { StepHandlers } from './steps/step-handlers';
import { clip, textLimits } from './text';

/** `restart`: a Recovery `rerun-previous-stage` reopened earlier stages; the engine starts over from them. */
export type StageRunResult = { kind: 'delivered' } | { kind: 'held'; status: RunStatus } | { kind: 'restart' };

type StepRunResult = { kind: 'done'; detail: string } | { kind: 'retry' } | { kind: 'held'; status: RunStatus } | { kind: 'restart' };

type AttemptResult = { kind: 'returned'; outcome: StepOutcome } | { kind: 'threw'; error: unknown };

interface FinishedAttempt {
  workspace: StageWorkspace;
  position: StepPosition;
  stepKey: StepKey;
  interruption: StepInterruption | null;
  result: AttemptResult;
}

const settledStepStatuses: ReadonlySet<StepStatus> = new Set<StepStatus>(['ok', 'warning', 'skipped']);

function nextUnsettledStep(active: ActiveRun, stageNumber: number): StepName | undefined {
  return stepOrder.find((step) => !settledStepStatuses.has(active.stepRecord(stageNumber, step).status));
}

/**
 * A stage resumed after `snapshot` ran keeps the params that snapshot recorded, so a
 * `retry-with-params` patch survives a pause, a stop or a watcher crash.
 */
async function restoreParams(workspace: StageWorkspace): Promise<void> {
  const snapshot = workspace.active.stepRecord(workspace.location.stageNumber, 'snapshot');
  if (!settledStepStatuses.has(snapshot.status) || snapshot.status === 'skipped') return;
  workspace.useParams((await workspace.stageInputManifest()).parameters);
}

function failedOutcome(result: AttemptResult): { failure: StepFailure; detail: string } | null {
  if (result.kind === 'returned' && result.outcome.kind === 'failed') return { failure: result.outcome.failure, detail: result.outcome.detail };
  return null;
}

/**
 * Runs the seven steps of one stage in order (RUN-FORMAT section 6), starting from the first step
 * not yet settled, so a resumed run continues from the exact step. A step ends `ok` or `warning`
 * when its handler's postcondition check passed (`passed` / `passed-with-caveat`), or `warning`
 * when the failure handler accepted failed checks; every other outcome holds the run. Each attempt runs under a `StepGuard`
 * (timeout, `stop`) whose signal reaches the executor and every agent call.
 */
@Injectable()
export class StageRunner {
  constructor(
    @Inject(ExecutorRegistry) private readonly executors: ExecutorRegistry,
    @Inject(StepHandlers) private readonly handlers: StepHandlers,
    @Inject(ASSET_RESOLVER) private readonly resolver: AssetResolverPort,
    @Inject(RunControlService) private readonly runControl: RunControlService,
    @Inject(StepFailureHandler) private readonly failureHandler: StepFailureHandler,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async run(active: ActiveRun, stageNumber: number): Promise<StageRunResult> {
    const stage = active.stage(stageNumber);
    const workspace = new StageWorkspace({
      active,
      location: { stageNumber, stageId: stage.stageId },
      executor: this.executors.forStage(stage.stageId),
      resolver: this.resolver,
    });
    await restoreParams(workspace);
    let executeDetail: string | null = null;
    for (let step = nextUnsettledStep(active, stageNumber); step !== undefined; step = nextUnsettledStep(active, stageNumber)) {
      const result = await this.runStep(workspace, step);
      if (result.kind === 'held' || result.kind === 'restart') return result;
      if (result.kind === 'done' && step === 'execute') executeDetail = result.detail;
    }
    await active.deliverStage(stageNumber, executeDetail ?? ownerTexts.stageDelivered(stageNumber, stage.stageId));
    return { kind: 'delivered' };
  }

  /** One attempt of one step, after the between-steps control and cost checks. */
  private async runStep(workspace: StageWorkspace, step: StepName): Promise<StepRunResult> {
    const active = workspace.active;
    const { stageNumber, stageId } = workspace.location;
    const held = await this.runControl.betweenSteps(active);
    if (held !== null) return held;

    const record = active.stepRecord(stageNumber, step);
    const limit = active.snapshot.limits.attemptsPerStep;
    // Also bounds a step that keeps killing the watcher: a crash resume takes no budget baseline.
    // `verify` is exempt: it runs the checks once more and the failure policy accepts them with a warning.
    if (step !== 'verify' && active.budget.attemptsUsed(stageNumber, record) >= limit) {
      const stepKey = formatStepKey({ stageId, step, attempt: Math.max(1, record.attempts) });
      const reason = ownerTexts.stepFailed(stageNumber, stageId, step, ownerTexts.attemptsExhausted(limit));
      await active.setState({ status: 'failed', since: this.now(), reason: clip(reason, textLimits.ownerText), stepKey }, stepKey);
      return { kind: 'held', status: 'failed' };
    }

    const position: StepPosition = { stageNumber, stageId, step, attempt: record.attempts + 1 };
    const stepKey = await active.beginStep(position);
    const timeoutMs = workspace.recipeStage()?.timeoutMs ?? active.snapshot.limits.commandTimeoutMs;
    const guard = this.runControl.guard(active, timeoutMs);
    let result: AttemptResult;
    try {
      const outcome = await this.handlers.forStep(step).run({ workspace, attempt: position.attempt, stepKey, signal: guard.signal });
      result = { kind: 'returned', outcome };
    } catch (error) {
      result = { kind: 'threw', error };
    }
    guard.close();

    if (result.kind === 'returned' && result.outcome.kind !== 'failed') {
      // The usual path to `ok` / `warning`: the handler's own postcondition check passed. A stop
      // that arrived meanwhile is applied by the next between-steps check.
      const caveat = result.outcome.kind === 'passed-with-caveat' || active.stepRecord(stageNumber, step).recoveries.length > 0;
      await active.endStep(position, caveat ? 'warning' : 'ok', result.outcome.detail);
      return { kind: 'done', detail: result.outcome.detail };
    }
    return this.afterUnpassedAttempt({ workspace, position, stepKey, interruption: guard.interruption, result });
  }

  /** A failed or thrown attempt: a stop holds the run, anything else is a failure. */
  private async afterUnpassedAttempt(finished: FinishedAttempt): Promise<StepRunResult> {
    const { workspace, position, stepKey, interruption, result } = finished;
    const active = workspace.active;
    const failed = failedOutcome(result);
    if (interruption === null) {
      // An error no executor reported is an engine or port fault, never retried as a step failure.
      if (failed === null) throw result.kind === 'threw' ? result.error : new StepInterruptedError('run-aborted');
      return this.failureHandler.handle({ workspace, position, stepKey, failure: failed.failure, detail: failureDetail(failed) });
    }

    const detail = failed?.detail ?? '';
    switch (interruption.kind) {
      case 'stop':
        // The stopped step stays `pending`; resume starts it again (PRD 7.3, criterion 14).
        await active.endStep(position, 'pending', `${detail} ${ownerTexts.stopRequested}`.trim());
        return this.runControl.interrupt(active, interruption.reason);
      case 'shutdown':
        // No `endStep`: the step stays `running`, and the next start settles it back to `pending` (criterion 13).
        return this.runControl.releaseForShutdown(active);
      case 'run-aborted':
        if (result.kind === 'threw') throw result.error;
        throw new StepInterruptedError('run-aborted');
      case 'timeout': {
        const message = ownerTexts.stepTimedOut(interruption.timeoutMs);
        const failure: StepFailure = { origin: 'executor', failure: { class: 'retryable', kind: 'timeout', message } };
        return this.failureHandler.handle({ workspace, position, stepKey, failure, detail: message });
      }
    }
  }

  private now(): string {
    return this.clock.now().toISOString();
  }
}

function failureDetail(failed: { failure: StepFailure; detail: string }): string {
  const { failure, detail } = failed;
  return failure.origin === 'postcondition' || failure.origin === 'checks' ? `${failure.postcondition}: ${detail}` : detail;
}
