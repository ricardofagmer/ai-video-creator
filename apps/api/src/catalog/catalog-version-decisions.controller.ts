import { Body, Controller, HttpCode, Param, Post, Put, Res } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { RetireLearningCommand } from '@studio/core/learnings';
import { PromoteVersionCommand } from '@studio/core/promotion';
import {
  AssetVersionParamsSchema,
  LearningNoteParamsSchema,
  PromoteVersionRequestSchema,
  RetireLearningRequestSchema,
  apiRouteSegments,
  type LearningNoteView,
  type PromoteAssetVersionResponse,
  type PromoteVersionRequest,
} from '@studio/shared/api';
import { type Response } from 'express';
import { type z } from 'zod';
import { CurrentPrincipal } from '../auth/auth.decorators';
import { PromotionResultMismatchError } from '../platform/api.errors';
import { RequestContext, type Principal } from '../platform/request-context';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { SearchIndexScheduler } from '../search/search-index.scheduler';
import { AssetVersionViewAssembler } from './asset-version-view.assembler';

type AssetVersionParams = z.output<typeof AssetVersionParamsSchema>;
type LearningNoteParams = z.output<typeof LearningNoteParamsSchema>;

/**
 * Owner-gated writes on one asset version (SPEC 0003 sections 5.4 and 5.5). Both routes sit behind
 * the global session guard and, being non-GET, the `Origin` allowlist of `HostOriginMiddleware`.
 * The approver and the clock come from the session and the server, never from the body; the
 * reason is passed to core and never logged here.
 */
@Controller(apiRouteSegments.catalogAssets)
export class CatalogVersionDecisionsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly context: RequestContext,
    private readonly views: AssetVersionViewAssembler,
    private readonly searchIndex: SearchIndexScheduler,
  ) {}

  /**
   * Criterion 35 (R2-AC-19): one recorded approval makes exactly this version `active` and
   * deprecates the one it replaces. 422 `promotion-ref-mismatch` when `acknowledgeRef` is not the
   * path's `id@version`; nothing is written then.
   */
  @Post(`:assetId/versions/:version/${apiRouteSegments.promotion}`)
  @HttpCode(201)
  async promote(
    @Param(new ZodValidationPipe(AssetVersionParamsSchema)) params: AssetVersionParams,
    @Body(new ZodValidationPipe(PromoteVersionRequestSchema)) body: PromoteVersionRequest,
    @CurrentPrincipal() principal: Principal,
  ): Promise<PromoteAssetVersionResponse> {
    const result = await this.commandBus.execute(
      new PromoteVersionCommand({
        target: 'asset-version',
        ref: `${params.assetId}@${params.version}`,
        acknowledgeRef: body.acknowledgeRef,
        reason: body.reason,
        evidence: body.evidence,
        decidedBy: principal.subject,
        correlationId: this.context.correlationId(),
      }),
    );
    if (result.target !== 'asset-version') throw new PromotionResultMismatchError();
    return {
      version: await this.views.one(result.version),
      replaced: result.replaced === null ? null : await this.views.one(result.replaced),
      approval: result.approval,
    };
  }

  /**
   * Section 5.5: active to retired, once; nothing is deleted. A note is retired only through the
   * version it belongs to (core answers 404 `learning-note-not-found` otherwise). The version's
   * search document changed, so it is re-indexed after the response (R2-AC-11).
   */
  @Put(`:assetId/versions/:version/${apiRouteSegments.learnings}/:noteId/status`)
  async retireLearning(
    @Param(new ZodValidationPipe(LearningNoteParamsSchema)) params: LearningNoteParams,
    @Body(new ZodValidationPipe(RetireLearningRequestSchema)) _body: z.output<typeof RetireLearningRequestSchema>,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LearningNoteView> {
    const result = await this.commandBus.execute(
      new RetireLearningCommand({ ref: `${params.assetId}@${params.version}`, noteId: params.noteId }),
    );
    this.searchIndex.afterResponse(response, [result.reindexRef]);
    return result.note;
  }
}
