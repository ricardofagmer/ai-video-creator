import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { type VoiceSampleJobFile } from '@studio/shared/asset-jobs';
import { type AssetRef } from '@studio/shared/catalog';
import { type Language } from '@studio/shared/recipes';
import { ProviderModeService } from '../../providers/provider-mode.service';
import { voiceSampleProviderOf } from '../asset-job-policy';
import { AssetJobRequester, type AssetJobDecision } from '../asset-job-requester';
import { AssetJobStore } from '../asset-job-store';
import { AssetJobVersions } from '../asset-job-versions';
import { AssetJobError } from '../asset-jobs.errors';
import { RequestVoiceSampleInputSchema, parseAssetJobInput } from '../asset-jobs.input';
import { isVoiceSampleClipPresent } from '../voice-sample-clips';
import { RequestVoiceSampleCommand } from './request-voice-sample.command';

interface VoiceSampleWish {
  replace: boolean;
  providerLive: boolean;
}

/**
 * Section 2: open jobs stay; a kept sample stays unless asked, unless it was a mock that can now be
 * real, or unless its clip is gone from disk (a done job with nothing to play). A done sample in
 * another language than asked is kept as it is.
 */
async function decideVoiceSample(
  current: VoiceSampleJobFile,
  wish: VoiceSampleWish,
  clipPresent: () => Promise<boolean>,
): Promise<AssetJobDecision> {
  switch (current.status) {
    case 'requested':
    case 'running':
      return 'keep';
    case 'done':
      if (wish.replace || (current.mode === 'mock' && wish.providerLive)) return 'replace';
      return (await clipPresent()) ? 'keep' : 'replace';
    case 'failed':
    case 'refused':
      return 'replace';
  }
}

function requestedVoiceSample(ref: AssetRef, language: Language, at: Date): VoiceSampleJobFile {
  const now = at.toISOString();
  return { format: 1, ref, kind: 'voice-sample', status: 'requested', requestedAt: now, updatedAt: now, language };
}

@CommandHandler(RequestVoiceSampleCommand)
export class RequestVoiceSampleHandler implements ICommandHandler<RequestVoiceSampleCommand, VoiceSampleJobFile> {
  private readonly logger = new Logger(RequestVoiceSampleHandler.name);

  constructor(
    private readonly versions: AssetJobVersions,
    private readonly modes: ProviderModeService,
    private readonly requester: AssetJobRequester,
    private readonly store: AssetJobStore,
  ) {}

  async execute(command: RequestVoiceSampleCommand): Promise<VoiceSampleJobFile> {
    const input = parseAssetJobInput(RequestVoiceSampleInputSchema, command.input);
    try {
      const { ref, version } = await this.versions.voice({ assetId: input.assetId, version: input.version });
      const wish: VoiceSampleWish = { replace: input.replace === true, providerLive: this.modes.isLive(voiceSampleProviderOf(version)) };
      return await this.requester.request({
        kind: 'voice-sample',
        ref,
        decide: (current) =>
          decideVoiceSample(current, wish, () => isVoiceSampleClipPresent(this.store.location('voice-sample', ref), current)),
        build: (at) => requestedVoiceSample(ref, input.language, at),
      });
    } catch (error) {
      if (error instanceof AssetJobError) {
        this.logger.log({ event: 'asset-job.refused-request', kind: 'voice-sample', assetId: input.assetId, version: input.version, reason: error.reason });
      }
      throw error;
    }
  }
}
