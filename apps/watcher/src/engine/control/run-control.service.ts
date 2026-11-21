import { Inject, Injectable, Optional } from '@nestjs/common';
import { type RunStatus, type StepKey } from '@studio/shared/run-format';
import { type ActiveRun } from '../active-run';
import { type Clock } from '../clock';
import { liveRunSpendUsd, runSpentWait } from '../cost/run-spend';
import { CLOCK, RUN_CONTROL } from '../engine.tokens';
import { type ControlState, type RunControlChannel } from '../seams';
import { clip, textLimits } from '../text';
import { StepGuard } from './step-guard';
import { WATCHER_SHUTDOWN, watcherShutdownText } from './watcher-shutdown';

export type ControlHold = { kind: 'held'; status: RunStatus };

/**
 * `control.json` and the run cost ceiling as the engine applies them (PRD 7.3, RUN-FORMAT 12):
 * between steps a `stop` ends the run `interrupted`, a `pause` ends it `paused` (the step that just
 * finished stays finished, the next one stays `pending`), and spend past `limits.costPerRunUsd`
 * puts it in `waiting`. While a step runs, `StepGuard` watches the same two files. A watcher
 * shutdown (R1-09, optional `WATCHER_SHUTDOWN`) releases the run without a status change, so it
 * resumes like a crash; an owner request read at the same time is applied first.
 */
@Injectable()
export class RunControlService {
  constructor(
    @Inject(RUN_CONTROL) private readonly control: RunControlChannel,
    @Inject(CLOCK) private readonly clock: Clock,
    @Optional() @Inject(WATCHER_SHUTDOWN) private readonly shutdown?: AbortSignal,
  ) {}

  async read(runDir: string): Promise<ControlState> {
    return this.control.read(runDir);
  }

  async clear(runDir: string, read: ControlState): Promise<void> {
    await this.control.clear(runDir, read);
  }

  guard(active: ActiveRun, timeoutMs: number): StepGuard {
    return new StepGuard({ active, control: this.control, timeoutMs, shutdown: this.shutdown }).open();
  }

  /**
   * Requests found when the execution started. `resume` lets a held run continue; a `stop` still
   * wins, and a `pause` without `resume` holds the run before its next step.
   */
  async holdAtStart(active: ActiveRun, state: ControlState): Promise<ControlHold | null> {
    for (const request of state.requests) await active.acknowledgeControl(request);
    if (state.directive.kind === 'stop') return this.interrupt(active, state.directive.reason);
    if (state.directive.kind === 'pause' && !state.resume) return this.pause(active);
    if (this.shutdown?.aborted === true) return this.releaseForShutdown(active);
    return null;
  }

  async betweenSteps(active: ActiveRun): Promise<ControlHold | null> {
    const state = await this.control.read(active.runDir);
    if (state.directive.kind === 'stop') {
      await active.acknowledgeControl('stop');
      return this.interrupt(active, state.directive.reason);
    }
    if (state.directive.kind === 'pause') {
      await active.acknowledgeControl('pause');
      return this.pause(active);
    }
    if (this.shutdown?.aborted === true) return this.releaseForShutdown(active);
    const spentUsd = await liveRunSpendUsd(active.runDir);
    const limitUsd = active.snapshot.limits.costPerRunUsd;
    if (spentUsd > limitUsd) return this.waitForCost(active, { spentUsd, limitUsd, stepKey: null });
    return null;
  }

  async interrupt(active: ActiveRun, reason: string): Promise<ControlHold> {
    await active.setState({ status: 'interrupted', since: this.now(), reason: clip(reason, textLimits.ownerText) });
    return { kind: 'held', status: 'interrupted' };
  }

  /**
   * Ends this execution on a watcher shutdown without a status transition: run.json stays
   * `running` and an aborted step stays `running`, so the next start crash-resumes from it
   * (`settleOrphanedSteps`, criterion 13). The held status reported to the caller is that
   * unchanged `running`; one `log` event records why the execution ended.
   */
  async releaseForShutdown(active: ActiveRun): Promise<ControlHold> {
    await active.emit({ type: 'log', level: 'warning', text: watcherShutdownText, stepKey: null });
    return { kind: 'held', status: 'running' };
  }

  async waitForCost(active: ActiveRun, spend: { spentUsd: number; limitUsd: number; stepKey: StepKey | null }): Promise<ControlHold> {
    const wait = runSpentWait(spend.spentUsd, spend.limitUsd);
    await active.setState({ status: 'waiting', since: this.now(), ...wait }, spend.stepKey);
    return { kind: 'held', status: 'waiting' };
  }

  private async pause(active: ActiveRun): Promise<ControlHold> {
    await active.setState({ status: 'paused', since: this.now() });
    return { kind: 'held', status: 'paused' };
  }

  private now(): string {
    return this.clock.now().toISOString();
  }
}
