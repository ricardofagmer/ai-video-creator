import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { GetRunPublicationsQuery, RecordPublicationCommand, RemovePublicationCommand } from '@studio/core/metrics';
import {
  CreatePublicationRequestSchema,
  PublicationParamsSchema,
  RunParamsSchema,
  apiRouteSegments,
  type CreatePublicationRequest,
  type PublicationParams,
  type PublicationView,
  type RemovePublicationResponse,
  type RunPublicationsView,
} from '@studio/shared/api';
import { type z } from 'zod';
import { CurrentPrincipal } from '../auth/auth.decorators';
import { RequestContext, type Principal } from '../platform/request-context';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { MetricsResponseAssembler } from './metrics-response.assembler';

type RunParams = z.output<typeof RunParamsSchema>;

/**
 * Publications of a run (SPEC 0006 sections 4.4, 5.1; C10 rev 5). Every route sits behind the
 * global session guard and, for the writes, the `Origin` allowlist of `HostOriginMiddleware`.
 * Recording a publication is a record of something the owner did elsewhere: the URL is handed to
 * core, which parses and rebuilds it and never fetches it (K6); this controller neither logs nor
 * echoes it. `recordedBy` comes from the session and `correlationId` from `x-request-id`, never
 * from the body. No route here sets a run status.
 */
@Controller(apiRouteSegments.runs)
export class RunPublicationsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly context: RequestContext,
    private readonly views: MetricsResponseAssembler,
  ) {}

  /** Each publication with its snapshot in force (latest `asOfDate`, `form` over `csv`) and up to 20 older. */
  @Get(`:runId/${apiRouteSegments.publications}`)
  async list(@Param(new ZodValidationPipe(RunParamsSchema)) params: RunParams): Promise<RunPublicationsView> {
    return this.views.publications(await this.queryBus.execute(new GetRunPublicationsQuery(params.runId)));
  }

  /**
   * Section 5.1, first failure refuses and nothing is written: 422 `publication-url-not-recognized`,
   * `publication-short-link-refused`, `publication-limit-reached`; 409 `publication-run-not-approved`,
   * `publication-already-linked`.
   */
  @Post(`:runId/${apiRouteSegments.publications}`)
  @HttpCode(201)
  async record(
    @Param(new ZodValidationPipe(RunParamsSchema)) params: RunParams,
    @Body(new ZodValidationPipe(CreatePublicationRequestSchema)) body: CreatePublicationRequest,
    @CurrentPrincipal() principal: Principal,
  ): Promise<PublicationView> {
    const view = await this.commandBus.execute(
      new RecordPublicationCommand({ runId: params.runId, request: body, recordedBy: principal.subject, correlationId: this.context.correlationId() }),
    );
    return this.views.publication(view);
  }

  /** 404 `publication-not-found`; 409 `publication-has-metrics` once a snapshot exists. */
  @Delete(`:runId/${apiRouteSegments.publications}/:publicationId`)
  @HttpCode(200)
  async remove(@Param(new ZodValidationPipe(PublicationParamsSchema)) params: PublicationParams): Promise<RemovePublicationResponse> {
    const view = await this.commandBus.execute(
      new RemovePublicationCommand({ runId: params.runId, publicationId: params.publicationId, correlationId: this.context.correlationId() }),
    );
    return this.views.removed(view);
  }
}
