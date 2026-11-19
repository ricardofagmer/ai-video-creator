import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { DecideCurationCommand, GetCurationQuery, ListCurationsQuery, RequestCurationCommand } from '@studio/core/curation';
import {
  CreateCurationRequestSchema,
  CurationDecisionRequestSchema,
  CurationParamsSchema,
  ListCurationsQuerySchema,
  apiRouteSegments,
  type CreateCurationRequest,
  type CurationDecisionRequest,
  type CurationPageView,
  type CurationView,
} from '@studio/shared/api';
import { type CorrelationId } from '@studio/shared/run-format';
import { type z } from 'zod';
import { CurrentPrincipal } from '../auth/auth.decorators';
import { CorrelationIdMissingError } from '../platform/api.errors';
import { RequestContext, type Principal } from '../platform/request-context';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { CurationResponseAssembler } from './curation-response.assembler';

type CurationParams = z.output<typeof CurationParamsSchema>;
type ListCurationsParams = z.output<typeof ListCurationsQuerySchema>;

/**
 * Curator proposals (SPEC 0005 sections 4.4, 5.1, 5.7; C10 rev 4). All four routes sit behind the
 * global session guard and, for the two POSTs, the `Origin` allowlist of `HostOriginMiddleware`.
 * The api writes only through core's curation commands: `curation.json` once at the request, and
 * the decision row on the owner's action. `decidedBy` comes from the session and `correlationId`
 * from `x-request-id`, never from the body. No route here sets a version status or makes anything
 * `active` (AC 35). Focus, reason and proposal text are passed to core and never logged here.
 */
@Controller(apiRouteSegments.curations)
export class CurationsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly context: RequestContext,
    private readonly views: CurationResponseAssembler,
  ) {}

  /** Newest first, rules/backend.md pagination (default 20, max 100); optionally one subject version. */
  @Get()
  async list(@Query(new ZodValidationPipe(ListCurationsQuerySchema)) query: ListCurationsParams): Promise<CurationPageView> {
    const page = await this.queryBus.execute(new ListCurationsQuery({ limit: query.limit, cursor: query.cursor, subjectRef: query.subjectRef }));
    return this.views.page(page);
  }

  /**
   * Section 5.1, first failure refuses and nothing is written or spent: 404
   * `curation-subject-not-found`; 422 subject, reviewed-run and month-ceiling refusals; 409
   * `curation-queue-full`, `curation-already-requested`, `curation-estimate-changed` (the consent
   * must be $1.00 to the cent); 503 `month-spend-unavailable` (fails closed).
   */
  @Post()
  @HttpCode(201)
  async request(@Body(new ZodValidationPipe(CreateCurationRequestSchema)) body: CreateCurationRequest): Promise<CurationView> {
    const view = await this.commandBus.execute(new RequestCurationCommand({ request: body, correlationId: this.correlationId() }));
    return this.views.one(view);
  }

  /** 404 `curation-not-found`. A terminal curation has its cost indexed on read (B16). */
  @Get(':curationId')
  async get(@Param(new ZodValidationPipe(CurationParamsSchema)) params: CurationParams): Promise<CurationView> {
    return this.views.one(await this.queryBus.execute(new GetCurationQuery(params.curationId)));
  }

  /**
   * Section 5.7: `save-draft` (a new `draft` version only), `decline`, or `compare` (created, not
   * started). 404 `curation-not-found`; 409 `curation-not-decidable`, `curation-already-decided`,
   * `curation-not-saved`, `curation-subject-refused`; `compare` passes the comparison reasons through.
   */
  @Post(`:curationId/${apiRouteSegments.curationDecision}`)
  @HttpCode(200)
  async decide(
    @Param(new ZodValidationPipe(CurationParamsSchema)) params: CurationParams,
    @Body(new ZodValidationPipe(CurationDecisionRequestSchema)) body: CurationDecisionRequest,
    @CurrentPrincipal() principal: Principal,
  ): Promise<CurationView> {
    const view = await this.commandBus.execute(
      new DecideCurationCommand({
        curationId: params.curationId,
        decision: body,
        decidedBy: principal.subject,
        correlationId: this.correlationId(),
      }),
    );
    return this.views.one(view);
  }

  /** `curation.json` and the decision row record it, so a missing id is refused, never invented. */
  private correlationId(): CorrelationId {
    const correlationId = this.context.correlationId();
    if (correlationId === null) throw new CorrelationIdMissingError();
    return correlationId;
  }
}
