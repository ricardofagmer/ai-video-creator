import { Body, Controller, Get, Headers, HttpCode, Param, Post, Res, StreamableFile } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  GetReferenceAnalysisQuery,
  GetVoiceSampleAudioQuery,
  GetVoiceSampleQuery,
  RequestReferenceAnalysisCommand,
  RequestVoiceSampleCommand,
} from '@studio/core/asset-jobs';
import {
  AssetVersionParamsSchema,
  RequestVoiceSampleRequestSchema,
  apiRouteSegments,
  type ReferenceAnalysisView,
  type RequestVoiceSampleRequest,
  type VoiceSampleView,
} from '@studio/shared/api';
import { formatAssetRef, type AssetRef } from '@studio/shared/catalog';
import { type Response } from 'express';
import { type z } from 'zod';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { AssetJobViewAssembler } from './asset-job-view.assembler';
import { VoiceSampleAudioStreamer } from './voice-sample-audio.streamer';

type AssetVersionParams = z.output<typeof AssetVersionParamsSchema>;

const versionPath = ':assetId/versions/:version';
const voiceSamplePath = `${versionPath}/${apiRouteSegments.voiceSample}`;
const referenceAnalysisPath = `${versionPath}/${apiRouteSegments.referenceAnalysis}`;

function refOf(params: AssetVersionParams): AssetRef {
  return formatAssetRef({ assetId: params.assetId, version: params.version });
}

/**
 * Asset jobs of one catalog version (guided-creation design sections 2 and 4, `asset-jobs.ts` route
 * table). Every route sits behind the global session guard; the two POSTs also behind the `Origin`
 * allowlist of `HostOriginMiddleware`, like every other mutating route. The api writes only the
 * `requested` job through core; the watcher runs it. No request field reaches a voice engine or a
 * model: the sentence is picked by `language` from the shared constant. Nothing here logs a path.
 */
@Controller(apiRouteSegments.catalogAssets)
export class AssetJobsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly views: AssetJobViewAssembler,
    private readonly audio: VoiceSampleAudioStreamer,
  ) {}

  /** Idempotent: an open or kept job is answered as it is. 404 unknown version; 422 `asset-job-not-a-voice`; 409 `asset-job-queue-full`. */
  @Post(voiceSamplePath)
  @HttpCode(202)
  async requestVoiceSample(
    @Param(new ZodValidationPipe(AssetVersionParamsSchema)) params: AssetVersionParams,
    @Body(new ZodValidationPipe(RequestVoiceSampleRequestSchema)) body: RequestVoiceSampleRequest,
  ): Promise<VoiceSampleView> {
    const job = await this.commandBus.execute(
      new RequestVoiceSampleCommand({ assetId: params.assetId, version: params.version, language: body.language, replace: body.replace ?? false }),
    );
    return this.views.voiceSample(refOf(params), { status: 'present', job });
  }

  @Get(voiceSamplePath)
  async getVoiceSample(@Param(new ZodValidationPipe(AssetVersionParamsSchema)) params: AssetVersionParams): Promise<VoiceSampleView> {
    const lookup = await this.queryBus.execute(new GetVoiceSampleQuery({ assetId: params.assetId, version: params.version }));
    return this.views.voiceSample(refOf(params), lookup);
  }

  /** 404 `asset-job-sample-not-ready` unless the sample is done with its clip on disk. */
  @Get(`${voiceSamplePath}/${apiRouteSegments.voiceSampleAudio}`)
  async getVoiceSampleAudio(
    @Param(new ZodValidationPipe(AssetVersionParamsSchema)) params: AssetVersionParams,
    @Headers('range') rangeHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const audio = await this.queryBus.execute(new GetVoiceSampleAudioQuery({ assetId: params.assetId, version: params.version }));
    return this.audio.stream({ ref: refOf(params), audio, rangeHeader, response });
  }

  /**
   * No body. An open or done analysis is answered as it is (no second bill); a failed or refused one
   * is replaced. 422 `asset-job-not-a-video-reference`, `asset-job-link-only`,
   * `asset-job-biometric-refused`; 409 `asset-job-queue-full`.
   */
  @Post(referenceAnalysisPath)
  @HttpCode(202)
  async requestReferenceAnalysis(
    @Param(new ZodValidationPipe(AssetVersionParamsSchema)) params: AssetVersionParams,
  ): Promise<ReferenceAnalysisView> {
    const job = await this.commandBus.execute(new RequestReferenceAnalysisCommand({ assetId: params.assetId, version: params.version }));
    // Core requests only an eligible version, so a returned job is never unavailable.
    return this.views.referenceAnalysis(refOf(params), { lookup: { status: 'present', job }, eligibility: 'ok' });
  }

  /** Never a 422: a version that cannot be analysed answers `none` with its `unavailable` reason. */
  @Get(referenceAnalysisPath)
  async getReferenceAnalysis(@Param(new ZodValidationPipe(AssetVersionParamsSchema)) params: AssetVersionParams): Promise<ReferenceAnalysisView> {
    const state = await this.queryBus.execute(new GetReferenceAnalysisQuery({ assetId: params.assetId, version: params.version }));
    return this.views.referenceAnalysis(refOf(params), state);
  }
}
