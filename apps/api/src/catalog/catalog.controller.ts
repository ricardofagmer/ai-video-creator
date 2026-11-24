import { Body, Controller, Get, HttpCode, Logger, Param, Post, Put, Query, Req, Res, StreamableFile } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ReferenceAnalysisEnqueuer } from '@studio/core/asset-jobs';
import {
  GetAssetVersionQuery,
  GetEntryFileTextQuery,
  GetImageContentQuery,
  ListAssetVersionsQuery,
  SaveAssetVersionCommand,
  SearchAssetsQuery,
  SetAssetStatusCommand,
} from '@studio/core/catalog';
import {
  AssetParamsSchema,
  AssetVersionParamsSchema,
  PageQuerySchema,
  RegisterAssetByReferenceRequestSchema,
  SaveAssetVersionByReferenceRequestSchema,
  SaveMetadataVersionRequestSchema,
  SearchAssetsQuerySchema,
  SetVersionStatusRequestSchema,
  apiRouteSegments,
  type AssetVersionPageView,
  type EntryFileView,
  type AssetVersionView,
  type RegisterAssetByReferenceRequest,
  type SaveAssetVersionByReferenceRequest,
  type SaveMetadataVersionRequest,
  type SetAssetStatusResponse,
  type SetVersionStatusRequest,
} from '@studio/shared/api';
import { formatAssetRef, type AssetVersion } from '@studio/shared/catalog';
import { type Request, type Response } from 'express';
import { type z } from 'zod';
import { abortOnDisconnect } from '../platform/abort-on-disconnect';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { SearchIndexScheduler } from '../search/search-index.scheduler';
import { AssetVersionViewAssembler } from './asset-version-view.assembler';
import { CatalogReferenceService } from './catalog-reference.service';
import { CatalogUploadService } from './catalog-upload.service';
import { ImageContentStreamer } from './image-content.streamer';

type AssetParams = z.output<typeof AssetParamsSchema>;
type AssetVersionParams = z.output<typeof AssetVersionParamsSchema>;

/**
 * Catalog (PRD 5): validate with C10, dispatch to the core catalog's CQRS handlers, map to views.
 * Rev 3 (SPEC 0003 section 4.3): views carry `searchIndex`, `learnings` and `activation`; every new
 * version is queued for the semantic index after its response is sent (B9).
 * Guided-creation design section 4: every save path ends in `saved`, which also asks for the
 * analysis of an eligible video reference without waiting for it; the response never changes.
 */
@Controller(apiRouteSegments.catalogAssets)
export class CatalogController {
  private readonly logger = new Logger(CatalogController.name);

  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly uploads: CatalogUploadService,
    private readonly references: CatalogReferenceService,
    private readonly views: AssetVersionViewAssembler,
    private readonly searchIndex: SearchIndexScheduler,
    private readonly referenceAnalysis: ReferenceAnalysisEnqueuer,
    private readonly images: ImageContentStreamer,
  ) {}

  @Get()
  async search(@Query(new ZodValidationPipe(SearchAssetsQuerySchema)) query: z.output<typeof SearchAssetsQuerySchema>): Promise<AssetVersionPageView> {
    return this.views.page(await this.queryBus.execute(new SearchAssetsQuery(query)));
  }

  /** Multipart: see C10 `uploadPartNames`. */
  @Post()
  @HttpCode(201)
  async create(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<AssetVersionView> {
    return this.saved(response, await this.uploads.createAsset(request, abortOnDisconnect(response)));
  }

  /**
   * Rev 4 (section 13.4): a new asset stored by reference. The path is validated before core is
   * called; the view hides the path of a biometric version (`storage.absolutePath: null`).
   */
  @Post(apiRouteSegments.byReference)
  @HttpCode(201)
  async registerByReference(
    @Body(new ZodValidationPipe(RegisterAssetByReferenceRequestSchema)) body: RegisterAssetByReferenceRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AssetVersionView> {
    return this.saved(response, await this.references.register(body, abortOnDisconnect(response)));
  }

  @Get(':assetId/versions')
  async listVersions(
    @Param(new ZodValidationPipe(AssetParamsSchema)) params: AssetParams,
    @Query(new ZodValidationPipe(PageQuerySchema)) query: z.output<typeof PageQuerySchema>,
  ): Promise<AssetVersionPageView> {
    return this.views.page(await this.queryBus.execute(new ListAssetVersionsQuery(params.assetId, query)));
  }

  @Post(':assetId/versions')
  @HttpCode(201)
  async saveVersion(
    @Param(new ZodValidationPipe(AssetParamsSchema)) params: AssetParams,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AssetVersionView> {
    return this.saved(response, await this.uploads.saveVersion(params.assetId, request, abortOnDisconnect(response)));
  }

  /**
   * A metadata-only edit still creates N+1 (PRD 5.4 rule 1), reusing the bytes of `fromVersion`.
   * With `entryFile` (skills spec addendum T5) a skill's stored folder keeps its other files and
   * gets the new entry file text.
   */
  @Post(':assetId/versions/from-previous')
  @HttpCode(201)
  async saveMetadataVersion(
    @Param(new ZodValidationPipe(AssetParamsSchema)) params: AssetParams,
    @Body(new ZodValidationPipe(SaveMetadataVersionRequestSchema)) body: SaveMetadataVersionRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AssetVersionView> {
    const version = await this.commandBus.execute(
      new SaveAssetVersionCommand({
        assetId: params.assetId,
        metadata: body.metadata,
        content:
          body.entryFile === undefined
            ? { source: 'previous-version', version: body.fromVersion }
            : { source: 'previous-version-entry-file', version: body.fromVersion, text: body.entryFile.text },
        signal: abortOnDisconnect(response),
      }),
    );
    return this.saved(response, version);
  }

  /** Rev 4 (section 13.4): version N+1 stored by reference, as `draft`. */
  @Post(`:assetId/versions/${apiRouteSegments.byReference}`)
  @HttpCode(201)
  async saveVersionByReference(
    @Param(new ZodValidationPipe(AssetParamsSchema)) params: AssetParams,
    @Body(new ZodValidationPipe(SaveAssetVersionByReferenceRequestSchema)) body: SaveAssetVersionByReferenceRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AssetVersionView> {
    return this.saved(response, await this.references.saveVersion(params.assetId, body, abortOnDisconnect(response)));
  }

  @Get(':assetId/versions/:version')
  async getVersion(@Param(new ZodValidationPipe(AssetVersionParamsSchema)) params: AssetVersionParams): Promise<AssetVersionView> {
    return this.views.one(await this.queryBus.execute(new GetAssetVersionQuery(`${params.assetId}@${params.version}`)));
  }

  /** Skills spec addendum T5: the entry file (SKILL.md) of a skill version as UTF-8 text; also a stored prompt's text (2026-11-23). */
  @Get(`:assetId/versions/:version/${apiRouteSegments.entryFile}`)
  async getEntryFile(
    @Param(new ZodValidationPipe(AssetVersionParamsSchema)) params: AssetVersionParams,
    @Res({ passthrough: true }) response: Response,
  ): Promise<EntryFileView> {
    const ref = `${params.assetId}@${params.version}`;
    const { path, text } = await this.queryBus.execute(new GetEntryFileTextQuery(ref, abortOnDisconnect(response)));
    return { path, text };
  }

  /** Stored PNG, JPEG or WebP bytes of an image version (catalog thumbnail); 404 `image-content-unavailable` otherwise. */
  @Get(`:assetId/versions/:version/${apiRouteSegments.image}`)
  async getImage(
    @Param(new ZodValidationPipe(AssetVersionParamsSchema)) params: AssetVersionParams,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const ref = formatAssetRef({ assetId: params.assetId, version: params.version });
    const image = await this.queryBus.execute(new GetImageContentQuery(ref));
    return this.images.stream({ ref, image, response });
  }

  /**
   * Rev 3 (**breaking**, SPEC 0003 L6, R2-AC-18): core refuses `status: 'active'` with
   * `PromotionApprovalRequiredError`, answered 422 `promotion-approval-required`; activation is
   * `POST .../promotion` only. `replaced` stays null.
   */
  @Put(':assetId/versions/:version/status')
  async setStatus(
    @Param(new ZodValidationPipe(AssetVersionParamsSchema)) params: AssetVersionParams,
    @Body(new ZodValidationPipe(SetVersionStatusRequestSchema)) body: SetVersionStatusRequest,
  ): Promise<SetAssetStatusResponse> {
    const result = await this.commandBus.execute(new SetAssetStatusCommand({ ref: `${params.assetId}@${params.version}`, status: body.status }));
    return {
      version: await this.views.one(result.version),
      replaced: result.replaced === null ? null : await this.views.one(result.replaced),
    };
  }

  private async saved(response: Response, version: AssetVersion): Promise<AssetVersionView> {
    const ref = formatAssetRef({ assetId: version.id, version: version.version });
    this.searchIndex.afterResponse(response, [ref]);
    this.enqueueAnalysis(ref, version);
    return this.views.one(version);
  }

  /**
   * Not awaited: the save is committed and its answer must not wait on the job queue. The enqueuer
   * already turns every failure into a logged outcome; the catch only keeps an unexpected rejection
   * from becoming an unhandled one, and logs the ref and the error name.
   */
  private enqueueAnalysis(ref: string, version: AssetVersion): void {
    this.referenceAnalysis.enqueueIfEligible(version).catch((error: unknown) => {
      this.logger.warn({ event: 'asset-job.enqueue-failed', kind: 'reference-analysis', ref, errorCode: error instanceof Error ? error.name : 'unknown' });
    });
  }
}
