import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { GetSearchIndexStatusQuery, SemanticSearchQuery } from '@studio/core/embeddings';
import {
  SemanticSearchRequestSchema,
  apiRouteSegments,
  type SearchIndexStatusResponse,
  type SemanticSearchRequest,
  type SemanticSearchResponse,
} from '@studio/shared/api';
import { AssetVersionViewAssembler } from '../catalog/asset-version-view.assembler';
import { RequestContext } from '../platform/request-context';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';

/**
 * Search by meaning (SPEC 0003 section 5.2, B10), its own controller base so it never clashes with
 * `/catalog/assets`. The query is a POST body so no access log or browser history keeps it; this
 * controller never logs it (the access log carries the route template only, core logs its length).
 * No response carries a vector: hits are mapped to `AssetVersionView`, which omits `embedding`.
 */
@Controller(apiRouteSegments.catalogSearch)
export class SearchController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly context: RequestContext,
    private readonly views: AssetVersionViewAssembler,
  ) {}

  /** 503 `embedding-unavailable` while the model is absent or rejected (R2-AC-07); lexical search is unaffected. */
  @Post()
  @HttpCode(200)
  async search(@Body(new ZodValidationPipe(SemanticSearchRequestSchema)) body: SemanticSearchRequest): Promise<SemanticSearchResponse> {
    const result = await this.queryBus.execute(new SemanticSearchQuery(body, { correlationId: this.context.correlationId() }));
    const versions = await this.views.many(result.items.map((hit) => hit.version));
    return {
      modelRef: result.modelRef,
      items: result.items.flatMap((hit, index) => {
        const version = versions[index];
        return version === undefined ? [] : [{ version, similarity: hit.similarity }];
      }),
      scanned: result.scanned,
      pending: result.pending,
    };
  }

  /** Model state and index counts; no path and no checksum value. */
  @Get(apiRouteSegments.searchIndexStatus)
  async status(): Promise<SearchIndexStatusResponse> {
    const status = await this.queryBus.execute(new GetSearchIndexStatusQuery());
    return { model: status.model, modelRef: status.modelRef, indexed: status.indexed, pending: status.pending, stale: status.stale };
  }
}
