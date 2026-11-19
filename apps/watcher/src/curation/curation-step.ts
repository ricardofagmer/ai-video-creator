import { Inject, Injectable, Logger } from '@nestjs/common';
import { type CurationId } from '@studio/shared/curation';
import { readCurationState, writeCurationState } from '@studio/shared/curation/files';
import { type Clock } from '../engine/clock';
import { errorName } from '../platform/error-name';
import { ClaimedCuration } from './claimed-curation';
import { CurationEventRecorder } from './curation-event.recorder';
import { claimedFileOf, failed, type CurationEnding } from './curation-file.mapper';
import { CurationPipeline } from './curation-pipeline';
import { CurationScanner, type ScannedCuration } from './curation-scanner';
import { CurationSignals } from './curation-signals';
import {
  CURATION_CLOCK,
  CURATION_PROCESS,
  CURATION_STOP,
  MAX_CONSECUTIVE_CLAIM_FAILURES,
  type CurationProcess,
} from './curation.tokens';

/**
 * The watcher's curation step (SPEC 0005 section 5.2, topology 0004 section 7). The daemon loop
 * calls `claimNext` only when no run is startable and awaits it to the curation's final write, so a
 * run and a curation never overlap and only one curation runs at a time (C5-AC-10). The queue is
 * the `requested` folders, served oldest first; the api bounds it at 3.
 *
 * - Sweep (Q7, B12): before this process claims anything, every `collecting` curation was claimed
 *   by a process that is gone (its `claim.pid` cannot be a claim of this one yet, even when the pid
 *   number was reused), so it ends `failed` / `watcher-restarted`; it is never resumed.
 * - Claim: re-read, rewrite `requested` -> `collecting` with `claim`, re-read to confirm the claim
 *   is ours; anything else is a lost race and is skipped. The 300 s signal starts here.
 * - The pipeline runs; the step writes the ending, and nothing after it. An ending whose write
 *   failed is kept and written again on later idle ticks, so a transient error does not leave the
 *   curation `collecting` (blocking its subject) until the next restart.
 * - A request whose claim failed `MAX_CONSECUTIVE_CLAIM_FAILURES` times is parked and ended
 *   `failed` / `internal-error` with this process's claim (one write), retried the same way, so it
 *   does not hold a queue slot unseen.
 *
 * Writes only `curations/<id>/` through `ClaimedCuration` and the shared helpers (K3); never SQLite
 * or the catalog, never status `requested`.
 */
@Injectable()
export class CurationStep {
  private readonly logger = new Logger(CurationStep.name);
  private readonly claimFailures = new Map<CurationId, number>();
  /** Endings whose final write failed, written again on later idle ticks. */
  private readonly unwrittenEndings = new Map<CurationId, { claimed: ClaimedCuration; ending: CurationEnding }>();
  private swept = false;
  private active = false;
  private scanFailing = false;

  constructor(
    @Inject(CurationScanner) private readonly scanner: CurationScanner,
    @Inject(CurationPipeline) private readonly pipeline: CurationPipeline,
    @Inject(CurationEventRecorder) private readonly events: CurationEventRecorder,
    @Inject(CURATION_CLOCK) private readonly clock: Clock,
    @Inject(CURATION_PROCESS) private readonly daemonProcess: CurationProcess,
    @Inject(CURATION_STOP) private readonly stop: AbortSignal,
  ) {}

  /** Once per process, before the first claim; never throws. Retried by `claimNext` if it failed. */
  async sweepStale(): Promise<void> {
    if (this.swept) return;
    let stale: ScannedCuration[];
    try {
      stale = await this.scanner.listCollecting();
    } catch (error) {
      this.logger.error({ event: 'curation.sweep-failed', error: errorName(error) });
      return;
    }
    for (const scanned of stale) await this.failStale(scanned);
    this.swept = true;
  }

  /**
   * Claims the oldest `requested` curation and runs it to its final write. True when a curation was
   * claimed, so the loop scans runs again at once; false when there was nothing to do. Never throws.
   */
  async claimNext(): Promise<boolean> {
    if (this.active || this.stop.aborted) return false;
    await this.sweepStale();
    if (!this.swept) return false;
    await this.retryUnwrittenEndings();
    const next = await this.nextClaimable();
    if (next === null) return false;
    this.active = true;
    try {
      let claimed: ClaimedCuration | null;
      try {
        claimed = await this.claim(next);
      } catch (error) {
        await this.recordClaimFailure(next, error);
        return false;
      }
      if (claimed === null) return false;
      await this.execute(claimed);
      return true;
    } finally {
      this.active = false;
    }
  }

  private async nextClaimable(): Promise<ScannedCuration | null> {
    let requested: ScannedCuration[];
    try {
      requested = await this.scanner.listRequested();
    } catch (error) {
      // curations/ unreadable: runs are unaffected; logged once per outage.
      if (!this.scanFailing) this.logger.error({ event: 'curations.scan-failed', error: errorName(error) });
      this.scanFailing = true;
      return null;
    }
    if (this.scanFailing) this.logger.log({ event: 'curations.scan-recovered' });
    this.scanFailing = false;
    return requested.find((scanned) => (this.claimFailures.get(scanned.file.curationId) ?? 0) < MAX_CONSECUTIVE_CLAIM_FAILURES) ?? null;
  }

  private async claim(scanned: ScannedCuration): Promise<ClaimedCuration | null> {
    const { location } = scanned;
    const current = await readCurationState(location);
    if (current.status !== 'present' || current.value.status !== 'requested') return null;
    // A stop during the scan or the re-read leaves the request `requested` for the next start.
    if (this.stop.aborted) return null;
    const claimedAt = this.clock.now();
    const at = claimedAt.toISOString();
    const { pid } = this.daemonProcess;
    await writeCurationState(location, claimedFileOf(current.value, { pid, at }));
    const written = await readCurationState(location);
    if (written.status !== 'present' || written.value.status !== 'collecting' || written.value.claim?.pid !== pid || written.value.claim.claimedAt !== at) {
      this.logger.warn({ event: 'curation.claim-lost', curationId: location.curationId });
      return null;
    }
    this.claimFailures.delete(location.curationId);
    const claimed = new ClaimedCuration({ location, file: written.value, events: this.events, clock: this.clock, claimedAtMs: claimedAt.getTime() });
    await claimed.event({ type: 'curation.claimed', pid });
    return claimed;
  }

  private async execute(claimed: ClaimedCuration): Promise<void> {
    const signals = new CurationSignals(this.stop);
    let ending: CurationEnding;
    try {
      ending = await this.pipeline.run(claimed, signals);
    } catch (error) {
      // A fired signal names the ending whatever error it surfaced as (C5-AC-06).
      const aborted = signals.abortReason();
      if (aborted === null) this.logger.error({ event: 'curation.step-failed', curationId: claimed.curationId, error: errorName(error) });
      ending = failed(aborted ?? 'internal-error');
    }
    await this.end(claimed, ending);
  }

  private async failStale(scanned: ScannedCuration): Promise<void> {
    const { file, location } = scanned;
    const claimedAtMs = Date.parse(file.claim?.claimedAt ?? file.updatedAt);
    const stale = new ClaimedCuration({ location, file, events: this.events, clock: this.clock, claimedAtMs });
    try {
      // A crash between a billed call and its progress write: the ledger total is the spend.
      await stale.reconcileSpend();
    } catch (error) {
      this.logger.warn({ event: 'curation.sweep-cost-unread', curationId: file.curationId, error: errorName(error) });
    }
    await this.end(stale, failed('watcher-restarted'));
  }

  /** The final write; a failure is kept and written again on the next idle tick (`retryUnwrittenEndings`). */
  private async end(claimed: ClaimedCuration, ending: CurationEnding): Promise<void> {
    try {
      await claimed.end(ending);
      this.unwrittenEndings.delete(claimed.curationId);
    } catch (error) {
      const retried = this.unwrittenEndings.has(claimed.curationId);
      this.unwrittenEndings.set(claimed.curationId, { claimed, ending });
      // Logged once per curation; the retry on every idle tick stays quiet until it succeeds.
      if (!retried) this.logger.error({ event: 'curation.end-unwritten', curationId: claimed.curationId, status: ending.status, error: errorName(error) });
    }
  }

  private async retryUnwrittenEndings(): Promise<void> {
    for (const { claimed, ending } of [...this.unwrittenEndings.values()]) {
      await this.end(claimed, ending);
      if (!this.unwrittenEndings.has(claimed.curationId)) this.logger.log({ event: 'curation.end-written', curationId: claimed.curationId, status: ending.status });
    }
  }

  private async recordClaimFailure(scanned: ScannedCuration, error: unknown): Promise<void> {
    const { curationId } = scanned.file;
    const failures = (this.claimFailures.get(curationId) ?? 0) + 1;
    this.claimFailures.set(curationId, failures);
    const parked = failures >= MAX_CONSECUTIVE_CLAIM_FAILURES;
    this.logger.error({ event: 'curation.claim-failed', curationId, error: errorName(error), failures, parked });
    if (parked) await this.endParked(scanned);
  }

  /**
   * A parked request would keep its queue slot and block its subject until a restart. It ends
   * `failed` / `internal-error` in one write that also records this process's claim, so the
   * watcher still writes only a folder it claimed; a failed write is retried like any ending.
   */
  private async endParked(scanned: ScannedCuration): Promise<void> {
    const claimedAt = this.clock.now();
    const file = claimedFileOf(scanned.file, { pid: this.daemonProcess.pid, at: claimedAt.toISOString() });
    const parked = new ClaimedCuration({ location: scanned.location, file, events: this.events, clock: this.clock, claimedAtMs: claimedAt.getTime() });
    await this.end(parked, failed('internal-error'));
  }
}
