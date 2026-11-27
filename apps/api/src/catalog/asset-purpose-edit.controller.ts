import { Body, Controller, Param, Put } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { SetAssetPurposeCommand } from '@studio/core/catalog';
import { AssetVersionParamsSchema, SetAssetPurposeRequestSchema, apiRouteSegments, type AssetVersionView } from '@studio/shared/api';
import { type z } from 'zod';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { AssetVersionViewAssembler } from './asset-version-view.assembler';

type AssetVersionParams = z.output<typeof AssetVersionParamsSchema>;
type SetAssetPurposeBody = z.output<typeof SetAssetPurposeRequestSchema>;

const purposePath = `:assetId/versions/:version/${apiRouteSegments.purpose}`;

/**
 * The owner's purpose edit of one catalog version (ADR 0012 decision 7, C-P4, AP-10). Same guards
 * as the other catalog routes: the global session guard and, being a PUT, the `Origin` allowlist of
 * `HostOriginMiddleware`. The body is checked at the boundary (1..280 characters of plain text,
 * trimmed); the handler checks it again. Object-level access is the `assetId` and `version` pair:
 * an unknown version answers 404 and no other row is touched. The new text never reaches a log.
 */
@Controller(apiRouteSegments.catalogAssets)
export class AssetPurposeEditController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly views: AssetVersionViewAssembler,
  ) {}

  /** 200 with the version view (`purposeSource: owner`); 400 invalid body; 404 unknown version. */
  @Put(purposePath)
  async setPurpose(
    @Param(new ZodValidationPipe(AssetVersionParamsSchema)) params: AssetVersionParams,
    @Body(new ZodValidationPipe(SetAssetPurposeRequestSchema)) body: SetAssetPurposeBody,
  ): Promise<AssetVersionView> {
    const version = await this.commandBus.execute(
      new SetAssetPurposeCommand({ assetId: params.assetId, version: params.version, purpose: body.purpose }),
    );
    return this.views.one(version);
  }
}
