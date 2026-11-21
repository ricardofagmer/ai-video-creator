import { Body, Controller, Delete, Get, HttpCode, Param, Post, Res } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CancelPublishCommand, GetRunPublishQuery, RequestPublishCommand } from '@studio/core/platforms';
import {
  PublishAttemptParamsSchema,
  PublishParamsSchema,
  PublishRequestSchema,
  RunPublishParamsSchema,
  apiRouteSegments,
  type PublishAttemptParams,
  type PublishAttemptView,
  type PublishParams,
  type PublishRequest,
  type RunPublishParams,
  type RunPublishView,
} from '@studio/shared/api';
import { type Response } from 'express';
import { CurrentPrincipal } from '../auth/auth.decorators';
import { RequestContext, type Principal } from '../platform/request-context';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { PublishAttemptSync } from './publish-attempt.sync';
import { PublishResponseAssembler } from './publish-response.assembler';

/** Section 4.4: a repeated `idempotencyKey` answers 200 with the stored attempt. */
const EXISTING_ATTEMPT_STATUS = 200;

/**
 * The publish routes of a run (SPEC 0007 sections 4.4 and 5.4, C10 rev 7). Every route sits behind
 * the global session guard and, for the writes, the `Origin` allowlist of `HostOriginMiddleware`
 * (AC 62). The api makes no platform call here and nothing in this folder makes an outbound
 * request: `RequestPublish` records the owner's request (a `publication_attempts` row and
 * `request.json`) and the POST answers 202 at once, while the watcher uploads between runs (AC 52,
 * K4). `requestedBy` comes from the session, the biometric confirmation time and `requestedAt` from
 * the server clock in core, `correlationId` from `x-request-id`, never from a body. The title,
 * caption and tags go to `request.json` only; no answer returns them and nothing here logs them.
 */
@Controller(apiRouteSegments.runs)
export class PublishingController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly context: RequestContext,
    private readonly attemptSync: PublishAttemptSync,
    private readonly views: PublishResponseAssembler,
  ) {}

  /** The dialog, after `PublishAttemptSync` copied the watcher's progress (polled every 2 s while open). */
  @Get(`:runId/${apiRouteSegments.publish}`)
  async dialog(@Param(new ZodValidationPipe(RunPublishParamsSchema)) params: RunPublishParams): Promise<RunPublishView> {
    await this.attemptSync.syncBeforeRead(params.runId);
    return this.views.runPublish(await this.queryBus.execute(new GetRunPublishQuery(params.runId)));
  }

  /**
   * Section 5.4, first failure refuses and nothing is written: 409 `platform-publish-unsupported`
   * (Instagram, OD8), `platform-awaiting-review`, `platform-not-connected`, `platform-mode-mismatch`,
   * `publish-run-not-approved`, `publish-artifact-missing`, `publish-artifact-changed`,
   * `publish-biometric-mismatch`, `publish-already-published`, `publish-already-in-progress`;
   * 422 `publish-visibility-not-allowed`. 202 for a new attempt, 200 when the key repeats.
   */
  @Post(`:runId/${apiRouteSegments.publish}/:platform`)
  @HttpCode(202)
  async request(
    @Param(new ZodValidationPipe(PublishParamsSchema)) params: PublishParams,
    @Body(new ZodValidationPipe(PublishRequestSchema)) body: PublishRequest,
    @CurrentPrincipal() principal: Principal,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublishAttemptView> {
    const result = await this.commandBus.execute(
      new RequestPublishCommand({
        runId: params.runId,
        platform: params.platform,
        request: body,
        requestedBy: principal.subject,
        createdBy: 'api',
        correlationId: this.context.correlationId(),
      }),
    );
    if (result.outcome === 'existing') response.status(EXISTING_ATTEMPT_STATUS);
    return this.views.attempt(result.attempt);
  }

  /** Section 5.4 "Cancel": only before the watcher's claim; 409 `publish-attempt-not-cancellable`, 404 `publish-attempt-not-found`. */
  @Delete(`:runId/${apiRouteSegments.publish}/${apiRouteSegments.publishAttempts}/:attemptId`)
  @HttpCode(200)
  async cancel(@Param(new ZodValidationPipe(PublishAttemptParamsSchema)) params: PublishAttemptParams): Promise<PublishAttemptView> {
    const view = await this.commandBus.execute(
      new CancelPublishCommand({ runId: params.runId, attemptId: params.attemptId, correlationId: this.context.correlationId() }),
    );
    return this.views.attempt(view);
  }
}
