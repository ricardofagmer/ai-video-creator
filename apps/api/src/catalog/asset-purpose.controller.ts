import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { RequestAssetPurposeGenerationCommand } from '@studio/core/asset-jobs';
import { AssetVersionParamsSchema, apiRouteSegments, type AssetVersionView } from '@studio/shared/api';
import { type z } from 'zod';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { AssetVersionViewAssembler } from './asset-version-view.assembler';

type AssetVersionParams = z.output<typeof AssetVersionParamsSchema>;

const purposeGenerationPath = `:assetId/versions/:version/${apiRouteSegments.purpose}/${apiRouteSegments.purposeGeneration}`;

/**
 * Asset purpose of one catalog version (ADR 0012, C-P4). Same guards as the other catalog routes:
 * the global session guard, and for this POST the `Origin` allowlist of `HostOriginMiddleware`.
 * The api writes only the `requested` job and the `purposeSource` column; the watcher writes the
 * text into the job file and the api copies it on the next read. No body: nothing from the request
 * reaches the model.
 */
@Controller(apiRouteSegments.catalogAssets)
export class AssetPurposeController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly views: AssetVersionViewAssembler,
  ) {}

  /** 202 with the version view (`purposeSource: none`, `purposeJob: requested`); 404 unknown version; 409 `asset-purpose-job-open`. */
  @Post(purposeGenerationPath)
  @HttpCode(202)
  async requestGeneration(@Param(new ZodValidationPipe(AssetVersionParamsSchema)) params: AssetVersionParams): Promise<AssetVersionView> {
    const version = await this.commandBus.execute(new RequestAssetPurposeGenerationCommand({ assetId: params.assetId, version: params.version }));
    return this.views.one(version);
  }
}
