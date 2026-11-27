import { rm } from 'node:fs/promises';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { isVoiceVersion } from '@studio/core/asset-jobs';
import { AssetVersionNotFoundError } from '@studio/core/catalog';
import { ProviderModeService, ProvidersError } from '@studio/core/providers';
import { type Secret } from '@studio/core/secrets';
import { VOICE_SAMPLE_TEXT, voiceSampleBounds, type VoiceSampleJobFile } from '@studio/shared/asset-jobs';
import { appendAssetJobEgress, assetJobFilePath, type AssetJobLocation } from '@studio/shared/asset-jobs/files';
import { AbsolutePathSchema, type AbsolutePath, type AssetVersion } from '@studio/shared/catalog';
import { type AssetResolverPort, type UsageQuantity } from '@studio/shared/ports';
import { newSessionId, writeFileAtomic } from '@studio/shared/run-files';
import { type Clock } from '../engine/clock';
import { ASSET_RESOLVER } from '../engine/engine.tokens';
import { CatalogLookup } from '../stages/shared/catalog-lookup';
import { STAGE_SETTINGS, type StageSettings } from '../stages/shared/stage-settings';
import { failedJob, refusedJob, type AssetJobEnding } from './asset-job-file.mapper';
import { type AssetJobSignals } from './asset-job-signals';
import { AssetJobSpend } from './asset-job-spend';
import { ASSET_JOBS_CLOCK } from './asset-jobs.tokens';
import { type ClaimedAssetJob, type VoiceSampleHandlerPort } from './claimed-asset-job';
import { planVoiceSample, type VoiceSamplePlan } from './voice-sample.plan';
import { speakSampleWithElevenLabs, speakSampleWithLocalVoice, speakSampleWithMock, type SpokenSample } from './voice-sample.speakers';

type ReadyPlan = Extract<VoiceSamplePlan, { status: 'ready' }>;
type VoiceLookup = { status: 'found'; version: AssetVersion } | { status: 'missing' };

/**
 * Voice samples (spec section 2). Order:
 * 1. resolve the version read-only: missing -> `failed` / `asset-missing`, not a voice ->
 *    `refused` / `not-supported`;
 * 2. pick the engine by the narration rule (`planVoiceSample`); a clone never reaches ElevenLabs
 *    (`refused` / `biometric-refused` if it ever would);
 * 3. live engines only: price the sentence (unpriceable -> `refused` / `month-spend-unavailable`)
 *    and check the month ceiling with that price (`month-ceiling`, `month-spend-unavailable`);
 * 4. ElevenLabs only: the egress line (`elevenlabs`, `tts-text`, amount = characters) before the call;
 * 5. speak `VOICE_SAMPLE_TEXT[job.language]` and nothing else;
 * 6. live engines only: record the cost (usage kind `tts`);
 * 7. check the clip (non-empty, at most `audioMaxBytes`), write it 0600 and remove the clip of the
 *    other format; the step then writes `done` with `mode`, `engine` and `audio`.
 * Logs carry the ref, the engine, codes and counts only: never the sentence or a voice file path.
 */
@Injectable()
export class VoiceSampleHandler implements VoiceSampleHandlerPort {
  private readonly logger = new Logger(VoiceSampleHandler.name);
  private readonly catalog: CatalogLookup;

  constructor(
    @Inject(QueryBus) queries: QueryBus,
    @Inject(ProviderModeService) private readonly modes: ProviderModeService,
    @Inject(STAGE_SETTINGS) private readonly settings: StageSettings,
    @Inject(ASSET_RESOLVER) private readonly assets: AssetResolverPort,
    @Inject(AssetJobSpend) private readonly spend: AssetJobSpend,
    @Inject(ASSET_JOBS_CLOCK) private readonly clock: Clock,
  ) {
    this.catalog = new CatalogLookup(queries);
  }

  async handle(job: ClaimedAssetJob<VoiceSampleJobFile>, signals: AssetJobSignals): Promise<AssetJobEnding> {
    const { location } = job;
    const lookup = await this.lookup(location);
    if (lookup.status === 'missing') return failedJob('asset-missing');
    const { version } = lookup;
    if (!isVoiceVersion(version)) return refusedJob('not-supported');
    const plan = planVoiceSample({ version, isLive: (provider) => this.modes.isLive(provider), elevenLabs: this.settings.elevenLabs });
    if (plan.status === 'refused') return refusedJob(plan.code);
    // Defence in depth: the plan sends a clone to the local voice only, and this keeps it so.
    if (plan.engine === 'elevenlabs' && version.sensitivity === 'biometric') return refusedJob('biometric-refused');
    const text = VOICE_SAMPLE_TEXT[job.file.language];
    const usage = usageOf(plan, text);
    let usd = 0;
    if (usage !== null) {
      const price = this.spend.priceOf(location, usage);
      if (price === null) return refusedJob('month-spend-unavailable');
      const refusal = price > 0 ? await this.spend.refusalFor(location, price) : null;
      if (refusal !== null) return refusedJob(refusal);
      usd = price;
    }
    signals.throwIfAborted();
    const spoken = await this.speak({ job, plan, text, signals });
    // Recorded before the signal is looked at: a sentence that was spoken was billed, stop or not.
    if (spoken.status === 'spoken' && usage !== null) await this.spend.record(location, { sessionId: newSessionId(), usage, usd });
    signals.throwIfAborted();
    // A cancelled call whose signal did not fire can only be the engine's own deadline.
    if (spoken.status === 'cancelled') return failedJob('timed-out');
    if (spoken.status === 'failed') return failedJob(spoken.code);
    if (spoken.audio.byteLength === 0 || spoken.audio.byteLength > voiceSampleBounds.audioMaxBytes) {
      this.logger.warn({ event: 'asset-job.sample-rejected', ref: location.ref, engine: plan.engine, bytes: spoken.audio.byteLength });
      return failedJob('output-invalid', usd);
    }
    await this.keepClip(location, spoken);
    this.logger.log({ event: 'asset-job.sample-spoken', ref: location.ref, engine: plan.engine, format: spoken.format, bytes: spoken.audio.byteLength, characters: text.length, usd });
    return { status: 'done', mode: plan.engine === 'mock' ? 'mock' : 'live', usd, result: { kind: 'voice-sample', engine: plan.engine, audio: spoken.format } };
  }

  private async lookup(location: AssetJobLocation): Promise<VoiceLookup> {
    try {
      return { status: 'found', version: await this.catalog.version(location.ref) };
    } catch (error) {
      if (error instanceof AssetVersionNotFoundError) return { status: 'missing' };
      throw error;
    }
  }

  private async speak(request: { job: ClaimedAssetJob<VoiceSampleJobFile>; plan: ReadyPlan; text: string; signals: AssetJobSignals }): Promise<SpokenSample> {
    const { job, plan, text, signals } = request;
    switch (plan.engine) {
      case 'mock':
        return speakSampleWithMock(text);
      case 'elevenlabs': {
        const credential = this.elevenLabsCredential(job.location);
        if (credential === null) return { status: 'failed', code: 'credential-refused' };
        await appendAssetJobEgress(job.location, { at: this.clock.now().toISOString(), provider: 'elevenlabs', what: 'tts-text', amount: text.length });
        return speakSampleWithElevenLabs({ credential, voiceId: plan.voiceId, modelId: plan.modelId, text, signal: signals.signal, now: () => this.clock.now() });
      }
      case 'local-voice': {
        const voicePath = await this.clonePath(job.location, signals.signal);
        if (voicePath === null) return { status: 'failed', code: 'asset-missing' };
        return speakSampleWithLocalVoice(this.settings, { language: job.file.language, text, voicePath, signal: signals.signal, timeoutMs: voiceSampleBounds.jobTimeoutMs });
      }
    }
  }

  private elevenLabsCredential(location: AssetJobLocation): Secret | null {
    try {
      return this.modes.credentialFor('elevenlabs');
    } catch (error) {
      if (!(error instanceof ProvidersError)) throw error;
      this.logger.warn({ event: 'asset-job.credential-unavailable', ref: location.ref, provider: 'elevenlabs', error: error.name });
      return null;
    }
  }

  /**
   * The clone's registered recording, located read-only through the catalog resolver, by the same
   * rule as narration's `registeredVoicePath`: biometric, stored by reference, absolute. The path
   * is returned to the local-voice call only; it is never logged, and a mismatch is reported by
   * ref and outcome alone.
   */
  private async clonePath(location: AssetJobLocation, signal: AbortSignal): Promise<AbsolutePath | null> {
    const resolution = await this.assets.resolve({ ref: location.ref, expectedContentHash: null, signal });
    if (resolution.status !== 'resolved') {
      this.logger.warn({ event: 'asset-job.voice-unresolved', ref: location.ref, outcome: resolution.status });
      return null;
    }
    const { asset } = resolution;
    if (asset.sensitivity !== 'biometric' || asset.storage !== 'reference') {
      this.logger.warn({ event: 'asset-job.voice-unresolved', ref: location.ref, outcome: 'not-a-registered-clone' });
      return null;
    }
    const checked = AbsolutePathSchema.safeParse(asset.absolutePath);
    return checked.success ? checked.data : null;
  }

  /** The clip enters the job folder through the C5 atomic write (0600); the other format's clip goes. */
  private async keepClip(location: AssetJobLocation, spoken: Extract<SpokenSample, { status: 'spoken' }>): Promise<void> {
    const kept = spoken.format === 'mp3' ? 'sampleMp3' : 'sampleWav';
    const other = spoken.format === 'mp3' ? 'sampleWav' : 'sampleMp3';
    await writeFileAtomic(assetJobFilePath(location, kept), spoken.audio);
    await rm(assetJobFilePath(location, other), { force: true });
  }
}

/** What a live engine bills: the sentence's characters. Null for the mock voice ($0, nothing recorded). */
function usageOf(plan: ReadyPlan, text: string): UsageQuantity | null {
  if (plan.engine === 'mock') return null;
  return { kind: 'tts', provider: plan.engine, characters: text.length };
}
