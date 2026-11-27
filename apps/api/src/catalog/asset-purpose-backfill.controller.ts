import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CountMissingPurposesQuery, RequestPurposeBackfillCommand } from '@studio/core/asset-jobs';
import { apiRouteSegments, type PurposeBackfillCountView, type PurposeBackfillResultView } from '@studio/shared/api';

const purposeBackfillPath = `${apiRouteSegments.purposes}/${apiRouteSegments.purposeBackfill}`;

/**
 * Purpose backfill of the catalog page (ADR 0012 decision 9, C-P4, AP-12). Same guards as the other
 * catalog routes: the global session guard, and for the POST the `Origin` allowlist of
 * `HostOriginMiddleware`. Neither route takes a body or a query, so nothing from the request
 * reaches the model; the web asks for the owner's confirmation before it calls the POST (AP-13).
 * `purposes/backfill` cannot clash with `:assetId/versions`, whose second segment is fixed.
 */
@Controller(apiRouteSegments.catalogAssets)
export class AssetPurposeBackfillController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  /** 200 `{ missing }`: latest and active versions without a purpose and without an open job. */
  @Get(purposeBackfillPath)
  async count(): Promise<PurposeBackfillCountView> {
    const { refs } = await this.queryBus.execute(new CountMissingPurposesQuery());
    return { missing: refs.length };
  }

  /** 200 `{ requested, failed }`; a failed request is counted, never an error answer. */
  @Post(purposeBackfillPath)
  @HttpCode(200)
  async backfill(): Promise<PurposeBackfillResultView> {
    return this.commandBus.execute(new RequestPurposeBackfillCommand());
  }
}
