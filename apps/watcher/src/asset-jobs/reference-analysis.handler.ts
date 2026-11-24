import { realpath } from 'node:fs/promises';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ReferenceAnalystCallError } from '@studio/core/agents';
import { referenceAnalysisEligibility, referenceLinkPostOf } from '@studio/core/asset-jobs';
import { AssetVersionNotFoundError } from '@studio/core/catalog';
import { ProviderModeService } from '@studio/core/providers';
import { RedactorService } from '@studio/core/redaction';
import { referenceAnalysisBounds, type ReferenceAnalysisJobFile } from '@studio/shared/asset-jobs';
import { appendAssetJobEgress, type AssetJobLocation } from '@studio/shared/asset-jobs/files';
import { type AssetVersion, type VideoPost } from '@studio/shared/catalog';
import { type AssetResolverPort, type ReferenceAnalystPort, type ReferenceAnalystResult, type UsageQuantity } from '@studio/shared/ports';
import { newSessionId } from '@studio/shared/run-files';
import { type SessionId } from '@studio/shared/run-format';
import { type Clock } from '../engine/clock';
import { ASSET_RESOLVER } from '../engine/engine.tokens';
import { CatalogLookup } from '../stages/shared/catalog-lookup';
import { withScratchDir } from '../stages/shared/scratch-dir';
import { STAGE_SETTINGS, type StageSettings } from '../stages/shared/stage-settings';
import { failedJob, refusedJob, type AssetJobEnding, type AssetJobRefusedCode } from './asset-job-file.mapper';
import { type AssetJobSignals } from './asset-job-signals';
import { AssetJobSpend } from './asset-job-spend';
import { ASSET_JOBS_CLOCK, REFERENCE_ANALYST } from './asset-jobs.tokens';
import { type ClaimedAssetJob, type ReferenceAnalysisHandlerPort } from './claimed-asset-job';
import { sampleReferenceFrames, type FrameSample } from './reference-frames.sampler';
import { downloadReferenceVideo, type ReferenceVideoDownloadFailure } from './reference-video.downloader';

type ReferenceVersion = Extract<AssetVersion, { kind: 'reference' }>;
type VideoLocation = { status: 'located'; path: string } | { status: 'ended'; ending: AssetJobEnding };
/** The frames of a stored file or of a link's fetched video, or how the job ends without them. */
type FramesOutcome = FrameSample | { status: 'failed'; code: ReferenceVideoDownloadFailure } | { status: 'ended'; ending: AssetJobEnding };

/**
 * Reference analyses (spec section 4, Amendments 2 and 3;
 * docs/specs/2026-11-24-link-reference-analysis-design.md for links and the Claude Code engine). Order:
 * 1. resolve the version read-only (missing -> `failed` / `asset-missing`) and re-check
 *    `referenceAnalysisEligibility`: `biometric` -> `refused` / `biometric-refused`, `link-only` and
 *    `not-a-video-reference` -> `refused` / `not-supported`;
 * 2. a stored file: locate it read-only through the catalog resolver (missing -> `asset-missing`)
 *    and re-check that neither the row nor the real path is biometric (`biometric-refused`).
 *    A link to a supported post: live only, check the month ceiling first, write the egress line
 *    (the platform, `video-download`) and fetch the video into a private scratch folder that is
 *    removed afterwards (`tool-missing`, `download-failed`, `timed-out`). Mock mode fetches nothing
 *    and answers a link with the labelled stand-in and no frames;
 * 3. sample the frames (`tool-missing`, `media-unreadable`, `timed-out`);
 * 4. live only: check the month ceiling with `worstCaseUsd` (skipped under the Claude Code engine,
 *    whose calls are priced 0) and write the egress line (`claude`, `reference-frames`, amount =
 *    frames, bytes = total). Mock mode skips both;
 * 5. call `analyse` once and record any billed usage, returned or thrown, before the ending;
 * 6. `ok` -> `done` (`mode`, `promptVersion`, `frames`, `analysis`); `failed` -> `failed` with the
 *    same code; `ReferenceAnalystCallError` -> the closest code (see `callErrorEnding`).
 * Logs carry the ref, counts, amounts and codes only: never a path, the notes, a frame or the analysis.
 */
@Injectable()
export class ReferenceAnalysisHandler implements ReferenceAnalysisHandlerPort {
  private readonly logger = new Logger(ReferenceAnalysisHandler.name);
  private readonly catalog: CatalogLookup;

  constructor(
    @Inject(QueryBus) queries: QueryBus,
    @Inject(REFERENCE_ANALYST) private readonly analyst: ReferenceAnalystPort,
    @Inject(ProviderModeService) private readonly modes: ProviderModeService,
    @Inject(RedactorService) private readonly redactor: RedactorService,
    @Inject(STAGE_SETTINGS) private readonly settings: StageSettings,
    @Inject(ASSET_RESOLVER) private readonly assets: AssetResolverPort,
    @Inject(AssetJobSpend) private readonly spend: AssetJobSpend,
    @Inject(ASSET_JOBS_CLOCK) private readonly clock: Clock,
  ) {
    this.catalog = new CatalogLookup(queries);
  }

  async handle(job: ClaimedAssetJob<ReferenceAnalysisJobFile>, signals: AssetJobSignals): Promise<AssetJobEnding> {
    const { location } = job;
    const version = await this.lookup(location);
    if (version === null) return failedJob('asset-missing');
    const eligibility = referenceAnalysisEligibility(version);
    if (eligibility === 'biometric') return refusedJob('biometric-refused');
    if (eligibility !== 'ok' || version.kind !== 'reference') return refusedJob('not-supported');
    const live = this.analyst.isLive();
    const post = referenceLinkPostOf(version);
    const sample = post === null ? await this.storedVideoFrames(location, signals) : await this.linkedVideoFrames({ location, post, live, signals });
    if (sample.status === 'aborted') signals.throwIfAborted();
    if (sample.status === 'ended') return sample.ending;
    if (sample.status !== 'sampled') return failedJob(sample.status === 'failed' ? sample.code : 'timed-out');
    if (live) {
      const refusal = await this.spendRefusal(location);
      if (refusal !== null) return refusedJob(refusal);
      await appendAssetJobEgress(location, { at: this.clock.now().toISOString(), provider: 'claude', what: 'reference-frames', amount: sample.frames.length, bytes: sample.bytes });
    }
    signals.throwIfAborted();
    const result = await this.call({ location, version, frames: sample.frames, durationMs: sample.durationMs, signals });
    if (result.status === 'thrown') return result.ending;
    return this.endingOf(location, result.result, sample.frames.length);
  }

  /** Null when the call may go ahead. The Claude Code engine bills nothing, so it has no ceiling to pass. */
  private async spendRefusal(location: AssetJobLocation): Promise<AssetJobRefusedCode | null> {
    if (this.modes.usesClaudeCode()) return null;
    return this.spend.refusalFor(location, referenceAnalysisBounds.worstCaseUsd);
  }

  private async storedVideoFrames(location: AssetJobLocation, signals: AssetJobSignals): Promise<FramesOutcome> {
    const video = await this.locateVideo(location, signals.signal);
    if (video.status === 'ended') return video;
    signals.throwIfAborted();
    return sampleReferenceFrames(this.settings, { videoPath: video.path, signal: signals.signal });
  }

  /**
   * The frames of a link reference. The video is fetched into a private scratch folder, sampled and
   * removed with the folder, whatever the outcome; it never enters the catalog. Nothing is fetched
   * for an analysis the month ceiling would refuse, nor in mock mode, where no connection is made.
   */
  private async linkedVideoFrames(request: { location: AssetJobLocation; post: VideoPost; live: boolean; signals: AssetJobSignals }): Promise<FramesOutcome> {
    const { location, post, live, signals } = request;
    if (!live) return { status: 'sampled', frames: [], durationMs: 0, bytes: 0 };
    const refusal = await this.spendRefusal(location);
    if (refusal !== null) return { status: 'ended', ending: refusedJob(refusal) };
    signals.throwIfAborted();
    await appendAssetJobEgress(location, { at: this.clock.now().toISOString(), provider: post.platform, what: 'video-download', amount: 1 });
    return withScratchDir(this.settings, async (directory): Promise<FramesOutcome> => {
      const download = await downloadReferenceVideo(this.settings, { post, directory, signal: signals.signal });
      this.logger.log({ event: 'asset-job.video-download-ended', ref: location.ref, platform: post.platform, outcome: download.status === 'failed' ? download.code : download.status, bytes: download.status === 'downloaded' ? download.bytes : 0 });
      if (download.status !== 'downloaded') return download;
      return sampleReferenceFrames(this.settings, { videoPath: download.path, signal: signals.signal });
    });
  }

  private async lookup(location: AssetJobLocation): Promise<AssetVersion | null> {
    try {
      return await this.catalog.version(location.ref);
    } catch (error) {
      if (error instanceof AssetVersionNotFoundError) return null;
      throw error;
    }
  }

  /**
   * The stored video, re-hashed by the resolver and never copied. The resolved row and the real
   * path are both checked for biometric material, the second through the redactor's biometric
   * path list, as core's agent tools do; a check that cannot run refuses (fails closed).
   */
  private async locateVideo(location: AssetJobLocation, signal: AbortSignal): Promise<VideoLocation> {
    const resolution = await this.assets.resolve({ ref: location.ref, expectedContentHash: null, signal });
    if (resolution.status !== 'resolved') {
      this.logger.warn({ event: 'asset-job.video-unresolved', ref: location.ref, outcome: resolution.status });
      return { status: 'ended', ending: failedJob('asset-missing') };
    }
    if (resolution.asset.sensitivity === 'biometric') return { status: 'ended', ending: refusedJob('biometric-refused') };
    let path: string;
    try {
      path = await realpath(resolution.asset.absolutePath);
    } catch {
      return { status: 'ended', ending: failedJob('asset-missing') };
    }
    const redacted = await this.redactor.redactText(path);
    if (redacted.status !== 'redacted' || redacted.counts.biometric > 0) {
      this.logger.warn({ event: 'asset-job.video-refused', ref: location.ref, reason: redacted.status === 'redacted' ? 'biometric-path' : 'redaction-failed' });
      return { status: 'ended', ending: refusedJob('biometric-refused') };
    }
    return { status: 'located', path };
  }

  private async call(request: {
    location: AssetJobLocation;
    version: ReferenceVersion;
    frames: Uint8Array[];
    durationMs: number;
    signals: AssetJobSignals;
  }): Promise<{ status: 'returned'; result: ReferenceAnalystResult } | { status: 'thrown'; ending: AssetJobEnding }> {
    const { location, version, frames, durationMs, signals } = request;
    try {
      const result = await this.analyst.analyse({
        ref: location.ref,
        name: version.name,
        ownerNotes: version.details.referenceNotes,
        frames,
        durationMs,
        signal: signals.signal,
      });
      return { status: 'returned', result };
    } catch (error) {
      if (!(error instanceof ReferenceAnalystCallError)) throw error;
      // A cancelled live call may already have been billed: its spend is recorded before the stop is named.
      const usd = await this.recordSpend(location, error.context);
      this.logger.warn({ event: 'asset-job.analysis-call-error', ref: location.ref, kind: error.kind, usd });
      return { status: 'thrown', ending: callErrorEnding(error, signals, usd) };
    }
  }

  private async endingOf(location: AssetJobLocation, result: ReferenceAnalystResult, frames: number): Promise<AssetJobEnding> {
    const usd = await this.recordSpend(location, result);
    this.logger.log({ event: 'asset-job.analysis-ended', ref: location.ref, outcome: result.status === 'ok' ? 'ok' : result.reason, mode: result.status === 'ok' ? result.mode : null, frames, usd });
    if (result.status === 'failed') return failedJob(result.reason, usd);
    return { status: 'done', mode: result.mode, usd, result: { kind: 'reference-analysis', frames, analysis: result.analysis } };
  }

  /**
   * Records what the call billed and returns the job's `usd`. A record failure is logged loudly by
   * `AssetJobSpend.record` and the job still ends with this amount: the call is never repeated to
   * get a recordable result, so a cost.json write failure cannot bill twice.
   */
  private async recordSpend(location: AssetJobLocation, spent: { sessionId: SessionId | null; usage: UsageQuantity | null; usd: number }): Promise<number> {
    if (spent.usage === null) return spent.usd;
    await this.spend.record(location, { sessionId: spent.sessionId ?? newSessionId(), usage: spent.usage, usd: spent.usd });
    return spent.usd;
  }
}

/**
 * - `cancelled`: the job's signal fired (the step names it from the signal); otherwise `timed-out`;
 * - `invalid-request`: the sampled frames or duration broke the bounds -> `media-unreadable`;
 * - `redaction-failed`: the name or notes could not be redacted, nothing was sent -> `provider-error`;
 * - `model-unpriced`: no call on an unknown price -> `refused` / `month-spend-unavailable`.
 */
function callErrorEnding(error: ReferenceAnalystCallError, signals: AssetJobSignals, usd: number): AssetJobEnding {
  switch (error.kind) {
    case 'cancelled':
      signals.throwIfAborted();
      return failedJob('timed-out', usd);
    case 'invalid-request':
      return failedJob('media-unreadable', usd);
    case 'redaction-failed':
      return failedJob('provider-error', usd);
    case 'model-unpriced':
      return refusedJob('month-spend-unavailable');
  }
}
