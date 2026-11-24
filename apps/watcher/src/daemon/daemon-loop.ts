import { Inject, Injectable, Logger } from '@nestjs/common';
import { type RunId } from '@studio/shared/run-format';
import { AssetJobStep } from '../asset-jobs/asset-job-step';
import { CurationStep } from '../curation/curation-step';
import { EngineError } from '../engine/engine.errors';
import { errorName } from '../platform/error-name';
import { MetricsPollStep } from '../platforms/metrics-poll.step';
import { PublishStep } from '../platforms/publish.step';
import { RunEngine } from '../engine/run-engine';
import { BusyIntervalTracker } from '../schedules/busy-interval.tracker';
import { ScheduleStep } from '../schedules/schedule-step';
import { DaemonLoopAlreadyRunningError } from './daemon.errors';
import { DAEMON_SHUTDOWN, MAX_CONSECUTIVE_RUN_FAILURES, RUN_SCAN_INTERVAL_MS } from './daemon.settings';
import { interruptibleDelay } from './interruptible-delay';
import { type RunCandidate, type RunTrigger } from './run-classification';
import { RunScanner } from './run-scanner';

interface FailureStreak {
  trigger: RunTrigger;
  failures: number;
}

/** A failed `runs/` scan is not "no run": a curation is claimed only on `none` (C5-AC-10). */
type NextRun = { kind: 'none' } | { kind: 'scan-failed' } | { kind: 'candidate'; candidate: RunCandidate };

type PublishIdleStep = Pick<PublishStep, 'sweep' | 'claimNext'>;
type MetricsPollIdleStep = Pick<MetricsPollStep, 'run'>;

/**
 * The daemon loop (SPEC 0002 R1-09, A8): scan `runs/`, execute the first startable run through
 * `RunEngine` to the point where it stops, then scan again. Exactly one run executes at a time
 * because the execution is awaited before the next scan, and a second call to `run` is refused.
 * The loop ends once the shutdown signal fires and the in-flight execution has returned.
 *
 * Curations (SPEC 0005 section 5.2, C5-AC-10): stale `collecting` curations are swept before the
 * first scan; afterwards a `requested` curation is claimed only when a successful scan found no
 * startable run (a failed `runs/` scan claims nothing), and is awaited to its final write before
 * the next scan, so a run and a curation never overlap and a run that arrives meanwhile waits at
 * most the 300 s curation bound.
 *
 * Schedules (SPEC 0006 section 5.6, B5): on the same `none` answer the schedule step is evaluated
 * first, because a slot has a deadline and a curation does not. A fired slot wrote one `pending`
 * run, so the loop scans again at once and executes it. A failed scan evaluates nothing. Each run
 * execution and each curation that ran is recorded in `BusyIntervalTracker`, so a slot that fell
 * due meanwhile and is evaluated more than `lateGraceMs` late is `missed` / `watcher-busy`.
 *
 * Platforms (SPEC 0007 section 5.5, OD5): `publish/` is swept once at start, after the curation
 * sweep. On the same `none` answer the idle steps run in order: `publish.claimNext()` (the owner is
 * waiting), `schedules.evaluate()`, `metricsPoll.run()` (bounded to one call per platform), then
 * `curations.claimNext()`. The publish step and the poll run under `busy.track`, so a run, an upload
 * and a curation never overlap; an upload that ran or a poll that called a platform sends the loop
 * back to scanning `runs/` at once.
 *
 * Asset jobs (guided-creation design section 1): stale `running` voice-sample and
 * reference-analysis jobs are swept at start, after the publish sweep; on `none` the asset-job step
 * runs last, after the curation step, under `busy.track`, so a run, a curation and a job never
 * overlap. A job that ran sends the loop back to scanning `runs/`.
 */
@Injectable()
export class DaemonLoop {
  private readonly logger = new Logger(DaemonLoop.name);
  private readonly streaks = new Map<RunId, FailureStreak>();
  private active = false;
  private scanFailing = false;

  constructor(
    @Inject(RunEngine) private readonly engine: Pick<RunEngine, 'execute'>,
    @Inject(RunScanner) private readonly scanner: Pick<RunScanner, 'scan'>,
    @Inject(CurationStep) private readonly curations: Pick<CurationStep, 'sweepStale' | 'claimNext'>,
    @Inject(ScheduleStep) private readonly schedules: Pick<ScheduleStep, 'evaluate'>,
    @Inject(BusyIntervalTracker) private readonly busy: Pick<BusyIntervalTracker, 'track'>,
    @Inject(DAEMON_SHUTDOWN) private readonly shutdown: AbortSignal,
    // Required (finding C11): a graph without the platform steps fails at bootstrap instead of
    // running a daemon that silently never publishes or polls.
    @Inject(PublishStep) private readonly publish: PublishIdleStep,
    @Inject(MetricsPollStep) private readonly metricsPoll: MetricsPollIdleStep,
    @Inject(AssetJobStep) private readonly assetJobs: Pick<AssetJobStep, 'sweepStale' | 'claimNext'>,
  ) {}

  async run(): Promise<void> {
    if (this.active) throw new DaemonLoopAlreadyRunningError();
    this.active = true;
    this.logger.log({ event: 'watcher.loop-started', scanIntervalMs: RUN_SCAN_INTERVAL_MS, maxConcurrentRuns: 1, platformSteps: 'wired' });
    try {
      await this.curations.sweepStale();
      // Section 5.5 crash safety: an upload whose claimant died is closed before anything new is claimed.
      await this.publish.sweep();
      await this.assetJobs.sweepStale();
      while (!this.shutdown.aborted) {
        const next = await this.nextRun();
        if (next.kind === 'candidate') {
          // A8: awaited to the end before the next scan; further startable runs wait in runs/ as the queue.
          const { candidate } = next;
          await this.busy.track(() => this.execute(candidate));
          continue;
        }
        // Between runs only, and only when the scan proved none is startable; true means a slot
        // fired a run or a curation ran to its end, so runs are scanned again at once.
        if (next.kind === 'none' && (await this.idleWork())) continue;
        await interruptibleDelay(RUN_SCAN_INTERVAL_MS, this.shutdown);
      }
    } finally {
      this.active = false;
    }
    this.logger.log({ event: 'watcher.loop-stopped', reason: 'shutdown' });
  }

  /**
   * Publish, schedules, metrics poll, curations (SPEC 0007 section 5.5, B5), then asset jobs. A step that found
   * nothing to do was not busy; one that worked sends the loop back to scanning `runs/`.
   */
  private async idleWork(): Promise<boolean> {
    if (await this.busy.track(() => this.publish.claimNext(), (claimed) => claimed)) return true;
    if (await this.schedules.evaluate()) return true;
    if (await this.busy.track(() => this.metricsPoll.run(), (called) => called)) return true;
    if (await this.busy.track(() => this.curations.claimNext(), (ran) => ran)) return true;
    return this.busy.track(() => this.assetJobs.claimNext(), (ran) => ran);
  }

  private async nextRun(): Promise<NextRun> {
    let candidates: RunCandidate[];
    try {
      candidates = await this.scanner.scan();
    } catch (error) {
      // runs/ unreadable (permissions, disk): the daemon stays up and retries on the next tick; logged once per outage.
      if (!this.scanFailing) this.logger.error({ event: 'runs.scan-failed', error: errorName(error) }, error instanceof Error ? error.stack : undefined);
      this.scanFailing = true;
      return { kind: 'scan-failed' };
    }
    if (this.scanFailing) this.logger.log({ event: 'runs.scan-recovered' });
    this.scanFailing = false;
    const candidate = candidates.find((scanned) => !this.isParked(scanned));
    return candidate === undefined ? { kind: 'none' } : { kind: 'candidate', candidate };
  }

  /** A run that failed the same way `MAX_CONSECUTIVE_RUN_FAILURES` times waits for a different trigger or a restart. */
  private isParked(candidate: RunCandidate): boolean {
    const streak = this.streaks.get(candidate.runId);
    return streak !== undefined && streak.trigger === candidate.trigger && streak.failures >= MAX_CONSECUTIVE_RUN_FAILURES;
  }

  private async execute(candidate: RunCandidate): Promise<void> {
    this.logger.log({ event: 'run.starting', runId: candidate.runId, trigger: candidate.trigger });
    try {
      const result = await this.engine.execute(candidate.runDir);
      this.streaks.delete(candidate.runId);
      this.logger.log({ event: 'run.stopped', runId: result.runId, status: result.status });
    } catch (error) {
      this.recordFailure(candidate, error);
    }
  }

  /**
   * The engine has already logged an internal error with its stack and recorded `failed` when it
   * could; this layer decides whether the run is tried again, so it logs the decision only.
   */
  private recordFailure(candidate: RunCandidate, error: unknown): void {
    const previous = this.streaks.get(candidate.runId);
    const failures = previous !== undefined && previous.trigger === candidate.trigger ? previous.failures + 1 : 1;
    this.streaks.set(candidate.runId, { trigger: candidate.trigger, failures });
    const parked = failures >= MAX_CONSECUTIVE_RUN_FAILURES;
    const line = { event: 'run.not-completed', runId: candidate.runId, trigger: candidate.trigger, error: errorName(error), failures, parked };
    // `conflict`: the run changed between the scan and the claim (another watcher, the owner); the next scan sees it.
    if (error instanceof EngineError && error.category === 'conflict') this.logger.warn(line);
    else this.logger.error(line);
  }
}
