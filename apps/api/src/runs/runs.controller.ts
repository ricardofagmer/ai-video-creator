import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CreateRunDraftCommand, ListRunsQuery, MarkRunPendingCommand } from '@studio/core/runs';
import {
  CreateRunRequestSchema,
  ListRunsQuerySchema,
  RunArtifactQuerySchema,
  RunEventsQuerySchema,
  RunParamsSchema,
  apiRouteSegments,
  type CreateRunRequest,
  type RunArtifactQuery,
  type RunDraftResponse,
  type RunEventsResponse,
  type RunIndexPageView,
  type RunStateResponse,
} from '@studio/shared/api';
import { type Response } from 'express';
import { type z } from 'zod';
import { ArtifactNotFoundError } from '../platform/api.errors';
import { RequestContext } from '../platform/request-context';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { FiredRunIndexSync } from '../schedules/fired-run-index.sync';
import { isArtifactServable } from './artifact-access.policy';
import { parseByteRange } from './byte-range';
import { RunArtifactAccessService } from './run-artifact-access.service';
import { RunArtifactReader } from './run-artifact.reader';
import { RunCursorReader } from './run-cursor.reader';
import { RunIndexSync } from './run-index-sync.service';
import { RunStateReader } from './run-state.reader';

type RunParams = z.output<typeof RunParamsSchema>;

/**
 * Runs (PRD 6-7). Writes are limited to the draft run.json and `draft` -> `pending` through the
 * core runs module (ADR 0003 "Who writes what"); everything else here reads the run folder.
 * Nothing here publishes or calls out: the watcher alone runs stages.
 */
@Controller(apiRouteSegments.runs)
export class RunsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly context: RequestContext,
    private readonly states: RunStateReader,
    private readonly artifacts: RunArtifactReader,
    private readonly indexSync: RunIndexSync,
    private readonly cursors: RunCursorReader,
    private readonly artifactAccess: RunArtifactAccessService,
    private readonly firedRuns: FiredRunIndexSync,
  ) {}

  /** Runs a schedule fired since the last look are indexed first (SPEC 0006 section 5.7, R3-AC-22). */
  @Get()
  async list(@Query(new ZodValidationPipe(ListRunsQuerySchema)) query: z.output<typeof ListRunsQuerySchema>): Promise<RunIndexPageView> {
    await this.firedRuns.syncFiredRuns();
    const page = await this.queryBus.execute(new ListRunsQuery(query));
    return { items: await this.cursors.withCursors(page.items), total: page.total, nextCursor: page.nextCursor };
  }

  @Post()
  @HttpCode(201)
  create(@Body(new ZodValidationPipe(CreateRunRequestSchema)) body: CreateRunRequest): Promise<RunDraftResponse> {
    return this.commandBus.execute(
      new CreateRunDraftCommand({ ...body, createdBy: 'api', correlationId: this.context.correlationId() }),
    );
  }

  @Get(':runId')
  async state(@Param(new ZodValidationPipe(RunParamsSchema)) params: RunParams): Promise<RunStateResponse> {
    const state = await this.states.readState(params.runId);
    this.indexSync.observe(params.runId, state.displayedStatus);
    return state;
  }

  @Post(':runId/start')
  @HttpCode(200)
  start(@Param(new ZodValidationPipe(RunParamsSchema)) params: RunParams): Promise<RunDraftResponse> {
    return this.commandBus.execute(new MarkRunPendingCommand(params.runId));
  }

  @Get(':runId/events')
  events(
    @Param(new ZodValidationPipe(RunParamsSchema)) params: RunParams,
    @Query(new ZodValidationPipe(RunEventsQuerySchema)) query: z.output<typeof RunEventsQuerySchema>,
  ): Promise<RunEventsResponse> {
    return this.states.readEvents(params.runId, query.fromByte ?? 0);
  }

  /**
   * Rev 4 (section 13.5, A25, A26): media is served only as the run's `artifactAccess` allows
   * (refused as `artifact-not-found`); JSON and text always. Every response is `no-store` with no
   * `ETag` or `Last-Modified`, so `If-None-Match`, `If-Modified-Since` and `If-Range` never yield a
   * 304; `Range` alone still selects bytes. The api streams from the run folder and writes no copy.
   */
  @Get(':runId/artifact')
  async artifact(
    @Param(new ZodValidationPipe(RunParamsSchema)) params: RunParams,
    @Query(new ZodValidationPipe(RunArtifactQuerySchema)) query: RunArtifactQuery,
    @Headers('range') rangeHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const access = await this.artifactAccess.forArtifactRoute(params.runId);
    if (!isArtifactServable(access, query.path)) throw new ArtifactNotFoundError();
    const opened = await this.artifacts.open(params.runId, query.path);
    let range: ReturnType<typeof parseByteRange>;
    try {
      range = parseByteRange(rangeHeader, opened.size);
    } catch (error) {
      await opened.handle.close();
      throw error;
    }
    const start = range.kind === 'partial' ? range.start : 0;
    const end = range.kind === 'partial' ? range.end : opened.size - 1;
    // An empty file has no last byte to name as `end`; reading it whole streams nothing.
    const stream = opened.handle.createReadStream(opened.size === 0 ? {} : { start, end });
    // Closing the stream closes the handle (autoClose), also when the client leaves mid-download.
    response.on('close', () => stream.destroy());
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Cache-Control', 'no-store');
    response.removeHeader('ETag');
    response.removeHeader('Last-Modified');
    if (range.kind === 'partial') {
      response.status(206);
      response.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${opened.size}`);
    }
    return new StreamableFile(stream, {
      type: opened.contentType,
      disposition: `${opened.disposition}; filename="${opened.fileName}"`,
      length: opened.size === 0 ? 0 : end - start + 1,
    });
  }
}
