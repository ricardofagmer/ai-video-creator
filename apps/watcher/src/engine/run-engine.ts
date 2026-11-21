import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  claimWatcherPid,
  readRunFile,
  readWatcherState,
  releaseWatcherPid,
  removeStaleWatcherPid,
  type WatcherState,
} from '@studio/shared/run-files';
import { formatStepKey, resumableStatuses, type RunFile, type RunId, type RunStatus } from '@studio/shared/run-format';
import { ActiveRun } from './active-run';
import { type Clock, type WatcherProcess } from './clock';
import { RunControlService } from './control/run-control.service';
import { ResumeNotRequestedError, RunAlreadyExecutingError, RunNotRunnableError, RunOwnedByAnotherWatcherError } from './engine.errors';
import { CLOCK, WATCHER_PROCESS } from './engine.tokens';
import { GateKeeper } from './gates/gate-keeper';
import { PlanRecorder } from './gates/plan-recorder';
import { ownerTexts, stepStatusText } from './owner-texts';
import { checkReviewReadiness } from './review-readiness';
import { captureBaseline, emptyBaseline } from './run-budget';
import { settleOrphanedSteps } from './run-mutations';
import { type ControlState } from './seams';
import { StageRunner } from './stage-runner';

export interface RunExecutionResult {
  runId: RunId;
  status: RunStatus;
}

/**
 * How this execution takes the run (PRD 7.3, RUN-FORMAT 12-14): `fresh` from `pending`;
 * `owner-resume` of a held run the owner asked to continue; `crash-resume` of a run recorded
 * `running` whose watcher is gone, which continues from its current step without redoing
 * delivered stages.
 */
type StartMode = { kind: 'fresh' } | { kind: 'owner-resume' } | { kind: 'crash-resume'; deadPid: number | null };

function isRecipeDisabled(run: Readonly<RunFile>, stageId: string): boolean {
  return run.recipe.definition.graph.stages.some((stage) => stage.stageId === stageId && !stage.enabled);
}

/** A human gate or planner questions are answered through approval.json; the gate keeper reads the answer. */
function waitsOnApproval(run: Readonly<RunFile>): boolean {
  return run.state.status === 'waiting' && (run.state.cause.kind === 'gate' || run.state.cause.kind === 'planner-questions');
}

function startModeOf(run: Readonly<RunFile>, owner: WatcherState, control: ControlState): StartMode {
  const status = run.state.status;
  if (status === 'pending') return { kind: 'fresh' };
  if (status === 'running') return { kind: 'crash-resume', deadPid: owner.status === 'dead' ? owner.pid : null };
  if (!resumableStatuses.includes(status)) throw new RunNotRunnableError(run.runId, status);
  // SPEC 0002 A6: a held run continues only on a `resume` request, or on an approval.json answer.
  if (!control.resume && !waitsOnApproval(run)) throw new ResumeNotRequestedError(run.runId, status);
  return { kind: 'owner-resume' };
}

/**
 * Takes one run folder from `pending`, or from where it was held, to where it stops: `review`, or
 * a held status (`waiting`, `paused`, `interrupted`, `failed`, `rejected`). It owns `watcher.pid`
 * for the whole execution and is the only path that writes run files (ADR 0003, C5).
 *
 * Ownership (RUN-FORMAT section 14, critic major 1): `watcher.pid` holds a pid plus boot-time stamp
 * and is created with O_EXCL. A file naming this process's own pid was left by an earlier life of
 * that pid (a reboot or a forced exit), never by this process, so it is stale like any dead owner;
 * that this process is executing a run right now is known in memory instead.
 */
@Injectable()
export class RunEngine {
  private readonly logger = new Logger(RunEngine.name);
  /** Run folders this process is executing now; `execute` refuses a second, re-entrant call. */
  private readonly executing = new Set<string>();

  constructor(
    @Inject(StageRunner) private readonly stageRunner: StageRunner,
    @Inject(GateKeeper) private readonly gateKeeper: GateKeeper,
    @Inject(PlanRecorder) private readonly planRecorder: PlanRecorder,
    @Inject(RunControlService) private readonly runControl: RunControlService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(WATCHER_PROCESS) private readonly watcherProcess: WatcherProcess,
  ) {}

  async execute(runDir: string): Promise<RunExecutionResult> {
    const run = await readRunFile(runDir);
    if (this.executing.has(runDir)) throw new RunAlreadyExecutingError(run.runId);
    const owner = await readWatcherState(runDir, { selfPid: this.watcherProcess.pid });
    if (owner.status === 'alive') throw new RunOwnedByAnotherWatcherError(run.runId, owner.pid);

    await this.claimRun(runDir, run);
    this.executing.add(runDir);
    try {
      // Read after `watcher.pid` exists: the api writes control.json only while no watcher lives (A6).
      const control = await this.runControl.read(runDir);
      const mode = startModeOf(run, owner, control);
      const baseline = mode.kind === 'owner-resume' ? captureBaseline(run) : emptyBaseline;
      const active = new ActiveRun({ runDir, run, pid: this.watcherProcess.pid, clock: this.clock, baseline });
      // Only the request just read is cleared; one written since survives for the next check.
      await this.runControl.clear(runDir, control);
      this.logger.log(`run ${run.runId} started (${mode.kind})`);
      await this.executeOwned(active, mode, control);
      const status = active.snapshot.state.status;
      this.logger.log(`run ${run.runId} stopped as ${status}`);
      return { runId: run.runId, status };
    } finally {
      this.executing.delete(runDir);
      await releaseWatcherPid(runDir, this.watcherProcess.pid);
    }
  }

  /**
   * Creates `watcher.pid` with O_EXCL. A file that is already there is removed only after it is
   * judged stale again, then the create is tried once more; losing that race to another watcher is
   * the same conflict as finding a live owner, and the next scan sees the run's new state.
   */
  private async claimRun(runDir: string, run: Readonly<RunFile>): Promise<void> {
    const selfPid = this.watcherProcess.pid;
    if ((await claimWatcherPid(runDir, selfPid)) === 'claimed') return;
    if ((await removeStaleWatcherPid(runDir, { selfPid })) && (await claimWatcherPid(runDir, selfPid)) === 'claimed') return;
    const holder = await readWatcherState(runDir, { selfPid });
    throw new RunOwnedByAnotherWatcherError(run.runId, holder.status === 'absent' ? selfPid : holder.pid);
  }

  private async executeOwned(active: ActiveRun, mode: StartMode, control: ControlState): Promise<void> {
    try {
      await this.claim(active, mode);
      const hold = await this.runControl.holdAtStart(active, control);
      if (hold === null) await this.drive(active);
    } catch (error) {
      await this.failOnInternalError(active, error);
      throw error;
    } finally {
      await active.finish();
    }
  }

  /** `running` for this pid; a crash first records `interrupted`, and its orphaned step goes back to `pending`. */
  private async claim(active: ActiveRun, mode: StartMode): Promise<void> {
    if (mode.kind === 'crash-resume') {
      await active.setState({ status: 'interrupted', since: this.now(), reason: ownerTexts.watcherDied(mode.deadPid) });
    }
    await active.start();
    const orphans = await active.apply((run) => settleOrphanedSteps(run, ownerTexts.stepOrphaned));
    for (const orphan of orphans) {
      const stage = active.stage(orphan.stageNumber);
      const record = active.stepRecord(orphan.stageNumber, orphan.step);
      await active.emit({
        type: 'step.status',
        level: 'warning',
        text: `${stepStatusText(stage.number, stage.stageId, orphan.step, 'pending')}. ${ownerTexts.stepOrphaned}`,
        stepKey: formatStepKey({ stageId: stage.stageId, step: orphan.step, attempt: Math.max(1, record.attempts) }),
        status: 'pending',
      });
    }
  }

  private async drive(active: ActiveRun): Promise<void> {
    for (const stage of active.snapshot.stages) {
      if (stage.outcome.status === 'pending' && isRecipeDisabled(active.snapshot, stage.stageId)) {
        await active.skipStage(stage.number);
      }
    }
    // A crash between the plan stage's delivery and its recording leaves `plan` unset.
    const deliveredPlan = active.snapshot.stages.find((stage) => stage.stageId === 'plan' && stage.outcome.status === 'delivered');
    if (deliveredPlan !== undefined && active.snapshot.plan === null) {
      if ((await this.planRecorder.record(active, deliveredPlan.number)).kind === 'held') return;
    }

    for (;;) {
      const next = active.snapshot.stages.find((stage) => stage.outcome.status === 'pending');
      if (next === undefined) break;
      if ((await this.gateKeeper.beforeStage(active, next.number)).kind === 'held') return;
      const result = await this.stageRunner.run(active, next.number);
      if (result.kind === 'held') return;
      // `restart`: a Recovery rerun reopened earlier stages; the loop picks the first pending one.
      if (result.kind === 'delivered' && next.stageId === 'plan') {
        if ((await this.planRecorder.record(active, next.number)).kind === 'held') return;
      }
    }
    await this.enterReview(active);
  }

  /** K5: `package` has run; the engine confirms its deliverables before `review`. */
  private async enterReview(active: ActiveRun): Promise<void> {
    const readiness = await checkReviewReadiness(active.runDir);
    if (readiness.status === 'not-ready') {
      await active.setState({ status: 'failed', since: this.now(), reason: ownerTexts.reviewNotReady(readiness.missing), stepKey: null });
      return;
    }
    await active.setState({ status: 'review', since: this.now() });
  }

  /** Best effort: an error while recording the failure joins the original one. */
  private async failOnInternalError(active: ActiveRun, error: unknown): Promise<void> {
    active.abortController.abort();
    this.logger.error(`run ${active.snapshot.runId} stopped on an internal error`, error instanceof Error ? error.stack : undefined);
    if (active.snapshot.state.status !== 'running') return;
    try {
      await active.setState({ status: 'failed', since: this.now(), reason: ownerTexts.internalError, stepKey: null });
    } catch (recordError) {
      throw new AggregateError([error, recordError], `run ${active.snapshot.runId} failed and the failure could not be recorded`);
    }
  }

  private now(): string {
    return this.clock.now().toISOString();
  }
}
