import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CreateComparisonCommand, GetComparisonQuery, ListComparisonsQuery, StartComparisonCommand } from '@studio/core/comparisons';
import {
  ComparisonParamsSchema,
  CreateComparisonRequestSchema,
  ListComparisonsQuerySchema,
  StartComparisonRequestSchema,
  apiRouteSegments,
  type ComparisonPageView,
  type ComparisonView,
  type CreateComparisonRequest,
  type StartComparisonRequest,
} from '@studio/shared/api';
import { type z } from 'zod';
import { CurrentPrincipal } from '../auth/auth.decorators';
import { RequestContext, type Principal } from '../platform/request-context';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { ComparisonResponseAssembler } from './comparison-response.assembler';

type ComparisonParams = z.output<typeof ComparisonParamsSchema>;

/**
 * A/B comparisons (SPEC 0003 section 5.3, criterion 34). Two ordinary runs from one brief; the api
 * writes only through core's comparison commands. `createdBy` and `acceptedBy` come from the
 * session and `correlationId` from `x-request-id`, never from the body. No route here changes a
 * version's status (R2-AC-17); the brief text is never logged.
 */
@Controller(apiRouteSegments.comparisons)
export class ComparisonsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly context: RequestContext,
    private readonly views: ComparisonResponseAssembler,
  ) {}

  /** Newest first, rules/backend.md pagination (default 20, max 100). */
  @Get()
  async list(@Query(new ZodValidationPipe(ListComparisonsQuerySchema)) query: z.output<typeof ListComparisonsQuerySchema>): Promise<ComparisonPageView> {
    return this.views.page(await this.queryBus.execute(new ListComparisonsQuery({ limit: query.limit, cursor: query.cursor })));
  }

  /**
   * R2-AC-12, R2-AC-16: two `draft` runs, nothing spent. 422 `comparison-subject-invalid` or
   * `comparison-biometric-refused` before any run or recipe version is created.
   */
  @Post()
  @HttpCode(201)
  async create(
    @Body(new ZodValidationPipe(CreateComparisonRequestSchema)) body: CreateComparisonRequest,
    @CurrentPrincipal() principal: Principal,
  ): Promise<ComparisonView> {
    const detail = await this.commandBus.execute(
      new CreateComparisonCommand({ request: body, createdBy: principal.subject, correlationId: this.context.correlationId() }),
    );
    return this.views.one(detail);
  }

  /** R2-AC-15: read from both run folders at request time; 404 `comparison-not-found`. */
  @Get(':comparisonId')
  async get(@Param(new ZodValidationPipe(ComparisonParamsSchema)) params: ComparisonParams): Promise<ComparisonView> {
    return this.views.one(await this.queryBus.execute(new GetComparisonQuery(params.comparisonId)));
  }

  /**
   * The D11 gate for both runs (R2-AC-13, R2-AC-14): 409 `comparison-not-startable` or
   * `comparison-estimate-changed`, 422 `comparison-over-month-ceiling`, 503
   * `month-spend-unavailable` (fails closed). After a refusal both runs stay `draft`.
   */
  @Post(':comparisonId/start')
  @HttpCode(200)
  async start(
    @Param(new ZodValidationPipe(ComparisonParamsSchema)) params: ComparisonParams,
    @Body(new ZodValidationPipe(StartComparisonRequestSchema)) body: StartComparisonRequest,
    @CurrentPrincipal() principal: Principal,
  ): Promise<ComparisonView> {
    const detail = await this.commandBus.execute(
      new StartComparisonCommand({
        comparisonId: params.comparisonId,
        acceptedWorstCaseUsd: body.acceptedWorstCaseUsd,
        acceptedBy: principal.subject,
        correlationId: this.context.correlationId(),
      }),
    );
    return this.views.one(detail);
  }
}
