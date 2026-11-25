import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AssetJobFile } from '@studio/shared/asset-jobs';
import { readAssetJobState, writeAssetJobState } from '@studio/shared/asset-jobs/files';
import { type Clock } from '../engine/clock';
import { errorName } from '../platform/error-name';
import { isAssetJobClaimantAlive } from './asset-job-claimant';
import { claimedFileOf, endedFileOf, endingCode, failedJob, type AssetJobEnding } from './asset-job-file.mapper';
import { AssetJobScanner, assetJobKey, type ScannedAssetJob } from './asset-job-scanner';
import { AssetJobSignals, type AssetJobAbortReason } from './asset-job-signals';
import {
  ASSET_JOBS_CLOCK,
  ASSET_JOBS_PROCESS,
  ASSET_JOBS_STOP,
  MAX_CONSECUTIVE_ASSET_JOB_CLAIM_FAILURES,
  type AssetJobProcess,
} from './asset-jobs.tokens';
import { type ClaimedAssetJob } from './claimed-asset-job';
import { AssetPurposeHandler } from './asset-purpose.handler';
import { ReferenceAnalysisHandler } from './reference-analysis.handler';
import { TemplatePreviewHandler } from './template-preview.handler';
import { VoiceSampleHandler } from './voice-sample.handler';

/**
 * The watcher's asset-job step (docs/specs/2026-11-23-guided-creation-design.md section 1), shaped
 * like the curation step. The daemon loop calls `claimNext` only when no run is startable, after
 * the curation step, and awaits it to the job's final write, so a run, a curation and a job never
 * overlap and one job runs at a time across both kinds. The queue is the `requested` jobs of both
 * kinds, oldest request first; the api bounds it at 10 per kind. Template previews (2026-11-25)
 * join the same queue.
 *
 * - Sweep: before this process claims anything, and again on every scan, a `running` job whose
 *   claimant is gone ends `failed` / `claimant-gone`; it is never resumed. Gone means no claim, a
 *   claim under an earlier boot, by this process's own pid (between jobs this process has none
 *   running, except an ending it failed to write, which is skipped and retried instead) or by a
 *   pid with no live process of this user. A live claimant (another watcher, which the
 *   single-instance lock should prevent) keeps its job.
 * - Claim: re-read, rewrite `requested` -> `running` with `claim {pid, claimedAt}`, re-read to
 *   confirm the claim is ours; anything else is a lost race and is skipped. The job signal starts here.
 * - The kind's handler runs; the step writes the ending through `writeAssetJobState`, and nothing
 *   after it. A shutdown during a job aborts its signal and the job ends `failed` /
 *   `claimant-gone` (the curation step ends `watcher-stopped`, which jobs have no code for); a
 *   stop before the claim leaves the request `requested` for the next start.
 * - An ending whose write failed is kept and written again on later idle ticks. A request whose
 *   claim failed `MAX_CONSECUTIVE_ASSET_JOB_CLAIM_FAILURES` times is parked and ended `failed` /
 *   `claimant-gone` with this process's claim (one write), so it does not hold a queue slot unseen.
 *
 * Writes only `asset-jobs/<kind>/<ref>/` through the shared helpers; never SQLite (ADR 0003) or
 * the catalog, never status `requested`.
 */
@Injectable()
export class AssetJobStep {
  private readonly logger = new Logger(AssetJobStep.name);
  private readonly claimFailures = new Map<string, number>();
  /** Endings whose final write failed, written again on later idle ticks. */
  private readonly unwrittenEndings = new Map<string, { job: ClaimedAssetJob; ending: AssetJobEnding }>();
  private swept = false;
  private active = false;
  private scanFailing = false;

  constructor(
    @Inject(AssetJobScanner) private readonly scanner: AssetJobScanner,
    @Inject(VoiceSampleHandler) private readonly voiceSamples: VoiceSampleHandler,
    @Inject(ReferenceAnalysisHandler) private readonly referenceAnalyses: ReferenceAnalysisHandler,
    @Inject(TemplatePreviewHandler) private readonly templatePreviews: TemplatePreviewHandler,
    @Inject(AssetPurposeHandler) private readonly assetPurposes: AssetPurposeHandler,
    @Inject(ASSET_JOBS_CLOCK) private readonly clock: Clock,
    @Inject(ASSET_JOBS_PROCESS) private readonly daemonProcess: AssetJobProcess,
    @Inject(ASSET_JOBS_STOP) private readonly stop: AbortSignal,
  ) {}

  /** Before the first claim and on every scan; never throws. `swept` stays false until one succeeds. */
  async sweepStale(): Promise<void> {
    let running: ScannedAssetJob[];
    try {
      running = await this.scanner.listRunning();
    } catch (error) {
      this.logger.error({ event: 'asset-job.sweep-failed', error: errorName(error) });
      return;
    }
    for (const scanned of running) {
      if (this.unwrittenEndings.has(assetJobKey(scanned.location))) continue;
      if (this.claimantAlive(scanned)) {
        if (!this.swept) this.logger.warn({ event: 'asset-job.sweep-skipped', reason: 'live-claimant', kind: scanned.file.kind, ref: scanned.file.ref, claimantPid: scanned.file.claim?.pid ?? null });
        continue;
      }
      this.logger.warn({ event: 'asset-job.claimant-gone', kind: scanned.file.kind, ref: scanned.file.ref, claimantPid: scanned.file.claim?.pid ?? null });
      await this.end({ location: scanned.location, file: scanned.file }, failedJob('claimant-gone'));
    }
    this.swept = true;
  }

  /** A liveness probe that fails is no proof of death: the job is left alone. */
  private claimantAlive(scanned: ScannedAssetJob): boolean {
    try {
      return isAssetJobClaimantAlive(scanned.file, { selfPid: this.daemonProcess.pid });
    } catch (error) {
      this.logger.warn({ event: 'asset-job.sweep-liveness-unknown', kind: scanned.file.kind, ref: scanned.file.ref, error: errorName(error) });
      return true;
    }
  }

  /**
   * Claims the oldest `requested` job and runs it to its final write. True when a job was claimed,
   * so the loop scans runs again at once; false when there was nothing to do. Never throws.
   */
  async claimNext(): Promise<boolean> {
    if (this.active || this.stop.aborted) return false;
    this.active = true;
    try {
      await this.retryUnwrittenEndings();
      await this.sweepStale();
      if (!this.swept) return false;
      const next = await this.nextClaimable();
      if (next === null) return false;
      let claimed: ClaimedAssetJob | null;
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

  private async nextClaimable(): Promise<ScannedAssetJob | null> {
    let requested: ScannedAssetJob[];
    try {
      requested = await this.scanner.listRequested();
    } catch (error) {
      // asset-jobs/ unreadable: runs are unaffected; logged once per outage.
      if (!this.scanFailing) this.logger.error({ event: 'asset-jobs.scan-failed', error: errorName(error) });
      this.scanFailing = true;
      return null;
    }
    if (this.scanFailing) this.logger.log({ event: 'asset-jobs.scan-recovered' });
    this.scanFailing = false;
    return requested.find((scanned) => (this.claimFailures.get(assetJobKey(scanned.location)) ?? 0) < MAX_CONSECUTIVE_ASSET_JOB_CLAIM_FAILURES) ?? null;
  }

  private async claim(scanned: ScannedAssetJob): Promise<ClaimedAssetJob | null> {
    const { location } = scanned;
    const current = await readAssetJobState(location);
    if (current.status !== 'present' || current.value.status !== 'requested') return null;
    // A stop during the scan or the re-read leaves the request `requested` for the next start.
    if (this.stop.aborted) return null;
    const at = this.clock.now().toISOString();
    const { pid } = this.daemonProcess;
    await writeAssetJobState(location, claimedFileOf(current.value, { pid, at }));
    const written = await readAssetJobState(location);
    if (written.status !== 'present' || written.value.status !== 'running' || written.value.claim?.pid !== pid || written.value.claim.claimedAt !== at) {
      this.logger.warn({ event: 'asset-job.claim-lost', kind: location.kind, ref: location.ref });
      return null;
    }
    this.claimFailures.delete(assetJobKey(location));
    this.logger.log({ event: 'asset-job.claimed', kind: location.kind, ref: location.ref, pid });
    return { location, file: written.value };
  }

  private async execute(claimed: ClaimedAssetJob): Promise<void> {
    const signals = new AssetJobSignals(this.stop, claimed.file.kind);
    let ending: AssetJobEnding;
    try {
      ending = await this.run(claimed, signals);
    } catch (error) {
      // A fired signal names the ending whatever error it surfaced as.
      const aborted = signals.abortReason();
      if (aborted === null) this.logger.error({ event: 'asset-job.step-failed', kind: claimed.location.kind, ref: claimed.location.ref, error: errorName(error) });
      ending = aborted === null ? failedJob('provider-error') : abortedEnding(aborted);
    }
    await this.end(claimed, ending);
  }

  /** The handler of the job's kind; the file's own discriminant picks it, so the types follow. */
  private run(claimed: ClaimedAssetJob, signals: AssetJobSignals): Promise<AssetJobEnding> {
    const { location, file } = claimed;
    switch (file.kind) {
      case 'voice-sample':
        return this.voiceSamples.handle({ location, file }, signals);
      case 'reference-analysis':
        return this.referenceAnalyses.handle({ location, file }, signals);
      case 'template-preview':
        return this.templatePreviews.handle({ location, file }, signals);
      case 'asset-purpose':
        return this.assetPurposes.handle({ location, file }, signals);
    }
  }

  /** The final write; a failure is kept and written again on the next idle tick (`retryUnwrittenEndings`). */
  private async end(job: ClaimedAssetJob, ending: AssetJobEnding): Promise<void> {
    const key = assetJobKey(job.location);
    try {
      await writeAssetJobState(job.location, this.endedFile(job.file, ending));
      this.unwrittenEndings.delete(key);
      this.logger.log({ event: 'asset-job.ended', kind: job.location.kind, ref: job.location.ref, status: ending.status, code: endingCode(ending), usd: ending.status === 'refused' ? 0 : ending.usd });
    } catch (error) {
      const retried = this.unwrittenEndings.has(key);
      this.unwrittenEndings.set(key, { job, ending });
      // Logged once per job; the retry on every idle tick stays quiet until it succeeds.
      if (!retried) this.logger.error({ event: 'asset-job.end-unwritten', kind: job.location.kind, ref: job.location.ref, status: ending.status, error: errorName(error) });
    }
  }

  /** A crossed result is a bug, not a result: the job ends `failed` rather than staying `running`. */
  private endedFile(file: AssetJobFile, ending: AssetJobEnding): AssetJobFile {
    const at = this.clock.now().toISOString();
    try {
      return endedFileOf(file, ending, at);
    } catch (error) {
      this.logger.error({ event: 'asset-job.ending-invalid', kind: file.kind, ref: file.ref, error: errorName(error) });
      return endedFileOf(file, failedJob('provider-error', ending.status === 'refused' ? 0 : ending.usd), at);
    }
  }

  private async retryUnwrittenEndings(): Promise<void> {
    for (const { job, ending } of [...this.unwrittenEndings.values()]) {
      await this.end(job, ending);
    }
  }

  private async recordClaimFailure(scanned: ScannedAssetJob, error: unknown): Promise<void> {
    const key = assetJobKey(scanned.location);
    const failures = (this.claimFailures.get(key) ?? 0) + 1;
    this.claimFailures.set(key, failures);
    const parked = failures >= MAX_CONSECUTIVE_ASSET_JOB_CLAIM_FAILURES;
    this.logger.error({ event: 'asset-job.claim-failed', kind: scanned.location.kind, ref: scanned.location.ref, error: errorName(error), failures, parked });
    if (parked) await this.endParked(scanned);
  }

  /**
   * A parked request would keep its queue slot until a restart. It ends `failed` / `claimant-gone`
   * in one write that also records this process's claim, so the watcher still writes only a job it
   * claimed; a failed write is retried like any ending.
   */
  private async endParked(scanned: ScannedAssetJob): Promise<void> {
    const file = claimedFileOf(scanned.file, { pid: this.daemonProcess.pid, at: this.clock.now().toISOString() });
    await this.end({ location: scanned.location, file }, failedJob('claimant-gone'));
  }
}

/** A daemon stop is the claimant going away; the job's own bound is a timeout. */
function abortedEnding(reason: AssetJobAbortReason): AssetJobEnding {
  return reason === 'watcher-stopped' ? failedJob('claimant-gone') : failedJob('timed-out');
}
