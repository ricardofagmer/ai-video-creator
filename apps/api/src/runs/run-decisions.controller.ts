import { Body, Controller, HttpCode, Param, Post, Res } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  PromoteFromRunCommand,
  RecordGateDecisionCommand,
  RecordReviewDecisionCommand,
  RequestRunControlCommand,
  SaveRunVideoCommand,
} from '@studio/core/review';
import {
  GateDecisionRequestSchema,
  PromoteFromRunRequestSchema,
  ReviewDecisionRequestSchema,
  RunControlRequestSchema,
  RunParamsSchema,
  apiRouteSegments,
  type GateDecisionRequest,
  type GateDecisionResponse,
  type PromoteFromRunRequest,
  type PromoteFromRunResponse,
  type ReviewDecisionRequest,
  type ReviewDecisionResponse,
  type RunControlRequest,
  type RunControlResponse,
  type SaveRunVideoResponse,
} from '@studio/shared/api';
import { formatAssetRef } from '@studio/shared/catalog';
import { type Response } from 'express';
import { type z } from 'zod';
import { CurrentPrincipal } from '../auth/auth.decorators';
import { RequestContext, type Principal } from '../platform/request-context';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { SearchIndexScheduler } from '../search/search-index.scheduler';
import { toGateDecision, toReviewDecision, type DecisionAuthority } from './decision.factory';
import { RunIndexSync } from './run-index-sync.service';

type RunParams = z.output<typeof RunParamsSchema>;

/**
 * Human decisions on a run (ADR 0003 "Who writes what"): control.json requests, gate answers,
 * the final review and promote-from-run, all through the core review module (R1-17). The decider
 * and the time come from the session and the server clock, never from the body.
 */
@Controller(apiRouteSegments.runs)
export class RunDecisionsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly context: RequestContext,
    private readonly indexSync: RunIndexSync,
    private readonly searchIndex: SearchIndexScheduler,
  ) {}

  @Post(':runId/control')
  @HttpCode(202)
  async control(
    @Param(new ZodValidationPipe(RunParamsSchema)) params: RunParams,
    @Body(new ZodValidationPipe(RunControlRequestSchema)) body: RunControlRequest,
  ): Promise<RunControlResponse> {
    const result = await this.commandBus.execute(new RequestRunControlCommand({ runId: params.runId, request: body }));
    return { runId: result.runId, requested: body.kind };
  }

  @Post(':runId/gate-decisions')
  @HttpCode(201)
  recordGateDecision(
    @Param(new ZodValidationPipe(RunParamsSchema)) params: RunParams,
    @Body(new ZodValidationPipe(GateDecisionRequestSchema)) body: GateDecisionRequest,
    @CurrentPrincipal() principal: Principal,
  ): Promise<GateDecisionResponse> {
    const decision = toGateDecision(body, this.authorityOf(principal));
    return this.commandBus.execute(new RecordGateDecisionCommand({ runId: params.runId, decision }));
  }

  @Post(':runId/review')
  @HttpCode(201)
  async recordReview(
    @Param(new ZodValidationPipe(RunParamsSchema)) params: RunParams,
    @Body(new ZodValidationPipe(ReviewDecisionRequestSchema)) body: ReviewDecisionRequest,
    @CurrentPrincipal() principal: Principal,
  ): Promise<ReviewDecisionResponse> {
    const decision = toReviewDecision(body, this.authorityOf(principal));
    const result = await this.commandBus.execute(new RecordReviewDecisionCommand({ runId: params.runId, decision }));
    this.indexSync.observe(result.runId, result.status);
    return result;
  }

  /** Saves a run artifact as a new `draft` version; it is queued for the semantic index after the response (B9). */
  @Post(':runId/promote')
  @HttpCode(201)
  async promote(
    @Param(new ZodValidationPipe(RunParamsSchema)) params: RunParams,
    @Body(new ZodValidationPipe(PromoteFromRunRequestSchema)) body: PromoteFromRunRequest,
    @CurrentPrincipal() principal: Principal,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PromoteFromRunResponse> {
    const result = await this.commandBus.execute(
      new PromoteFromRunCommand({
        runId: params.runId,
        artifactPath: body.artifactPath,
        assetId: body.assetId,
        decidedBy: principal.subject,
      }),
    );
    this.searchIndex.afterResponse(response, [formatAssetRef({ assetId: result.assetId, version: result.version })]);
    return result;
  }

  /** Saves the run's `final.mp4` as a `reference` video asset for its preset; indexed after the response. */
  @Post(':runId/save-video')
  @HttpCode(201)
  async saveVideo(
    @Param(new ZodValidationPipe(RunParamsSchema)) params: RunParams,
    @CurrentPrincipal() principal: Principal,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SaveRunVideoResponse> {
    const result = await this.commandBus.execute(new SaveRunVideoCommand({ runId: params.runId, decidedBy: principal.subject }));
    this.searchIndex.afterResponse(response, [formatAssetRef({ assetId: result.assetId, version: result.version })]);
    return result;
  }

  private authorityOf(principal: Principal): DecisionAuthority {
    return { principal, decidedAt: new Date(), correlationId: this.context.correlationId() };
  }
}
