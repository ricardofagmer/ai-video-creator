import { Body, Controller, Get, Headers, HttpCode, Logger, Param, Post, Put, Query, Req, Res, StreamableFile } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AssetPurposeEnqueuer, ReferenceAnalysisEnqueuer, TemplatePreviewEnqueuer } from '@studio/core/asset-jobs';
import {
  GetAssetVersionQuery,
  GetAudioContentQuery,
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
import { AudioContentStreamer } from './audio-content.streamer';
import { CatalogReferenceService } from './catalog-reference.service';
import { CatalogUploadService } from './catalog-upload.service';
import { ImageContentStreamer } from './image-content.streamer';

type AssetParams = z.output<typeof AssetParamsSchema>;
type AssetVersionParams = z.output<typeof AssetVersionParamsSchema>;

/**
 * ADR 0012: whether a save asks for the new version's purpose. `from-previous` copies the purpose
 * of its source version instead (AP-08), so it skips the job.
 */
type PurposeOnSave = 'enqueue' | 'skip';

/**
 * Catalog (PRD 5): validate with C10, dispatch to the core catalog's CQRS handlers, map to views.
 * Rev 3 (SPEC 0003 section 4.3): views carry `searchIndex`, `learnings` and `activation`; every new
 * version is queued for the semantic index after its response is sent (B9).
 * Guided-creation design section 4: every save path ends in `saved`, which also asks for the
 * analysis of an eligible video reference without waiting for it; the response never changes.
 * ADR 0012 (AP-01): `create`, `saveVersion` and both by-reference saves also ask for the version's
 * purpose the same way; `from-previous` does not.
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
    private readonly templatePreview: TemplatePreviewEnqueuer,
    private readonly purposes: AssetPurposeEnqueuer,
    private readonly images: ImageContentStreamer,
    private readonly audio: AudioContentStreamer,
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
    // A plain copy keeps the source purpose; a new entry file writes new bytes and gets a job (owner, 2026-11-25).
    return this.saved(response, version, body.entryFile === undefined ? 'skip' : 'enqueue');
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

  /** Stored bytes of a music version for the "Listen" button, `Range` honoured; 404 otherwise. */
  @Get(`:assetId/versions/:version/${apiRouteSegments.audio}`)
  async getAudio(
    @Param(new ZodValidationPipe(AssetVersionParamsSchema)) params: AssetVersionParams,
    @Headers('range') rangeHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const ref = formatAssetRef({ assetId: params.assetId, version: params.version });
    const audio = await this.queryBus.execute(new GetAudioContentQuery(ref));
    return this.audio.stream({ ref, audio, rangeHeader, response });
  }

  /**
   * Deprecation only (SPEC 0003 L6, R2-AC-18): the body accepts `deprecated` alone, so any other
   * status answers 400 `validation` before core runs; activation is `POST .../promotion` only.
   */
  @Put(':assetId/versions/:version/status')
  async setStatus(
    @Param(new ZodValidationPipe(AssetVersionParamsSchema)) params: AssetVersionParams,
    @Body(new ZodValidationPipe(SetVersionStatusRequestSchema)) body: SetVersionStatusRequest,
  ): Promise<SetAssetStatusResponse> {
    const result = await this.commandBus.execute(new SetAssetStatusCommand({ ref: `${params.assetId}@${params.version}`, status: body.status }));
    return { version: await this.views.one(result.version) };
  }

  private async saved(response: Response, version: AssetVersion, purpose: PurposeOnSave = 'enqueue'): Promise<AssetVersionView> {
    const ref = formatAssetRef({ assetId: version.id, version: version.version });
    this.searchIndex.afterResponse(response, [ref]);
    this.enqueueAnalysis(ref, version);
    this.enqueuePreview(ref, version);
    if (purpose === 'enqueue') this.enqueuePurpose(ref, version);
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

  /** Template preview (2026-11-25): same contract as the analysis enqueue; the backfill retries a miss. */
  private enqueuePreview(ref: string, version: AssetVersion): void {
    this.templatePreview.enqueueIfEligible(version).catch((error: unknown) => {
      this.logger.warn({ event: 'asset-job.enqueue-failed', kind: 'template-preview', ref, errorCode: error instanceof Error ? error.name : 'unknown' });
    });
  }

  /** Asset purpose (ADR 0012, AP-01): same contract; a failed enqueue never fails the save. */
  private enqueuePurpose(ref: string, version: AssetVersion): void {
    this.purposes.enqueue(version).catch((error: unknown) => {
      this.logger.warn({ event: 'asset-job.enqueue-failed', kind: 'asset-purpose', ref, errorCode: error instanceof Error ? error.name : 'unknown' });
    });
  }
}
