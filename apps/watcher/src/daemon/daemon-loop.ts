import { Inject, Injectable, Logger } from '@nestjs/common';
import { type RunId } from '@studio/shared/run-format';
import { CurationStep } from '../curation/curation-step';
import { EngineError } from '../engine/engine.errors';
import { errorName } from '../platform/error-name';
import { RunEngine } from '../engine/run-engine';
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
 */
@Injectable()
export class DaemonLoop {
  private readonly logger = new Logger(DaemonLoop.name);
  private readonly streaks = new Map<RunId, FailureStreak>();
  private active = false;
  private scanFailing = false;

  constructor(
    @Inject(RunEngine) private readonly engine: RunEngine,
    @Inject(RunScanner) private readonly scanner: RunScanner,
    @Inject(CurationStep) private readonly curations: CurationStep,
    @Inject(DAEMON_SHUTDOWN) private readonly shutdown: AbortSignal,
  ) {}

  async run(): Promise<void> {
    if (this.active) throw new DaemonLoopAlreadyRunningError();
    this.active = true;
    this.logger.log({ event: 'watcher.loop-started', scanIntervalMs: RUN_SCAN_INTERVAL_MS, maxConcurrentRuns: 1 });
    try {
      await this.curations.sweepStale();
      while (!this.shutdown.aborted) {
        const next = await this.nextRun();
        if (next.kind === 'candidate') {
          // A8: awaited to the end before the next scan; further startable runs wait in runs/ as the queue.
          await this.execute(next.candidate);
          continue;
        }
        // Between runs only, and only when the scan proved none is startable; true means a curation
        // ran to its end, so runs are scanned again at once.
        if (next.kind === 'none' && (await this.curations.claimNext())) continue;
        await interruptibleDelay(RUN_SCAN_INTERVAL_MS, this.shutdown);
      }
    } finally {
      this.active = false;
    }
    this.logger.log({ event: 'watcher.loop-stopped', reason: 'shutdown' });
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
