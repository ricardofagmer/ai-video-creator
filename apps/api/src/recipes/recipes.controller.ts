import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { PromoteVersionCommand } from '@studio/core/promotion';
import {
  CreateRecipeCommand,
  GetRecipeVersionQuery,
  ListRecipeVersionsQuery,
  SaveRecipeVersionCommand,
  SetRecipeStatusCommand,
} from '@studio/core/recipes';
import {
  CreateRecipeRequestSchema,
  ListRecipesQuerySchema,
  PromoteVersionRequestSchema,
  RecipeParamsSchema,
  RecipeVersionParamsSchema,
  SaveRecipeVersionRequestSchema,
  SetVersionStatusRequestSchema,
  apiRouteSegments,
  type CreateRecipeRequest,
  type PromoteRecipeVersionResponse,
  type PromoteVersionRequest,
  type RecipeVersionPageView,
  type RecipeVersionView,
  type SaveRecipeVersionRequest,
  type SetRecipeStatusResponse,
  type SetVersionStatusRequest,
} from '@studio/shared/api';
import { type z } from 'zod';
import { CurrentPrincipal } from '../auth/auth.decorators';
import { PromotionResultMismatchError } from '../platform/api.errors';
import { RequestContext, type Principal } from '../platform/request-context';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { RecipeVersionViewAssembler } from './recipe-version-view.assembler';

type RecipeParams = z.output<typeof RecipeParamsSchema>;
type RecipeVersionParams = z.output<typeof RecipeVersionParamsSchema>;

/**
 * Recipes (PRD 6). Field shapes of the definition are checked at this boundary; the recipes module
 * applies the C2 cross-field rules and checks every binding against the catalog. Rev 3 (SPEC 0003
 * section 4.3): every view carries `activation`; `PUT .../status` only deprecates (any other status
 * answers 400 `validation`); `POST .../promotion` records the owner's approval.
 */
@Controller(apiRouteSegments.recipes)
export class RecipesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly context: RequestContext,
    private readonly views: RecipeVersionViewAssembler,
  ) {}

  @Get()
  async list(@Query(new ZodValidationPipe(ListRecipesQuerySchema)) query: z.output<typeof ListRecipesQuerySchema>): Promise<RecipeVersionPageView> {
    const page = await this.queryBus.execute(new ListRecipeVersionsQuery(query));
    return { items: await this.views.many(page.items), total: page.total, nextCursor: page.nextCursor };
  }

  @Post()
  @HttpCode(201)
  async create(@Body(new ZodValidationPipe(CreateRecipeRequestSchema)) body: CreateRecipeRequest): Promise<RecipeVersionView> {
    return this.views.one(await this.commandBus.execute(new CreateRecipeCommand({ recipeId: body.recipeId, definition: body.definition })));
  }

  @Post(':recipeId/versions')
  @HttpCode(201)
  async saveVersion(
    @Param(new ZodValidationPipe(RecipeParamsSchema)) params: RecipeParams,
    @Body(new ZodValidationPipe(SaveRecipeVersionRequestSchema)) body: SaveRecipeVersionRequest,
  ): Promise<RecipeVersionView> {
    return this.views.one(await this.commandBus.execute(new SaveRecipeVersionCommand({ recipeId: params.recipeId, definition: body.definition })));
  }

  @Get(':recipeId/versions/:version')
  async getVersion(@Param(new ZodValidationPipe(RecipeVersionParamsSchema)) params: RecipeVersionParams): Promise<RecipeVersionView> {
    return this.views.one(await this.queryBus.execute(new GetRecipeVersionQuery(`${params.recipeId}@${params.version}`)));
  }

  /** Deprecation only (L6, R2-AC-18): the body accepts `deprecated` alone; anything else answers 400. */
  @Put(':recipeId/versions/:version/status')
  async setStatus(
    @Param(new ZodValidationPipe(RecipeVersionParamsSchema)) params: RecipeVersionParams,
    @Body(new ZodValidationPipe(SetVersionStatusRequestSchema)) body: SetVersionStatusRequest,
  ): Promise<SetRecipeStatusResponse> {
    const result = await this.commandBus.execute(new SetRecipeStatusCommand({ ref: `${params.recipeId}@${params.version}`, status: body.status }));
    return { version: await this.views.one(result.version) };
  }

  /**
   * Criterion 35, B15 (R2-AC-19): one recorded approval activates exactly this recipe version.
   * The approver comes from the session; the reason goes to core only and is never logged here.
   */
  @Post(`:recipeId/versions/:version/${apiRouteSegments.promotion}`)
  @HttpCode(201)
  async promote(
    @Param(new ZodValidationPipe(RecipeVersionParamsSchema)) params: RecipeVersionParams,
    @Body(new ZodValidationPipe(PromoteVersionRequestSchema)) body: PromoteVersionRequest,
    @CurrentPrincipal() principal: Principal,
  ): Promise<PromoteRecipeVersionResponse> {
    const result = await this.commandBus.execute(
      new PromoteVersionCommand({
        target: 'recipe-version',
        ref: `${params.recipeId}@${params.version}`,
        acknowledgeRef: body.acknowledgeRef,
        reason: body.reason,
        evidence: body.evidence,
        decidedBy: principal.subject,
        correlationId: this.context.correlationId(),
      }),
    );
    if (result.target !== 'recipe-version') throw new PromotionResultMismatchError();
    return {
      version: await this.views.one(result.version),
      replaced: result.replaced === null ? null : await this.views.one(result.replaced),
      approval: result.approval,
    };
  }
}
