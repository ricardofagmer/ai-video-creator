import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { DisconnectCommand, GetPlatformsQuery, SetPlatformGateCommand, StartConnectionCommand } from '@studio/core/platforms';
import {
  GateChangeRequestSchema,
  PlatformParamsSchema,
  apiRouteSegments,
  type ConnectionStartView,
  type DisconnectResult,
  type GateChangeRequest,
  type PlatformParams,
  type PlatformView,
  type PlatformsView,
} from '@studio/shared/api';
import { CurrentPrincipal } from '../auth/auth.decorators';
import { MetricInboxSync } from '../metrics/metric-inbox.sync';
import { ApiConfig } from '../platform/api-config';
import { RequestContext, type Principal } from '../platform/request-context';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { PlatformResponseAssembler } from './platform-response.assembler';

/**
 * The owner's platform routes (SPEC 0007 sections 4.4, 5.2 and 5.3, C10 rev 7). Every route sits
 * behind the global session guard and, for the writes, the `Origin` allowlist of
 * `HostOriginMiddleware` (AC 62). `:platform` is checked with `PlatformSchema`. `updatedBy` comes
 * from the session, the connect `state` is bound to the session id, and `correlationId` comes from
 * `x-request-id`, never from a body. The api calls a platform only inside connect (core
 * `CompleteConnection`: code exchange, one identity call) and disconnect (core `Disconnect`: one
 * best-effort revoke); starting a connection makes no platform call (AC 52). No answer carries a
 * token, a client secret or a platform account id.
 */
@Controller(apiRouteSegments.platforms)
export class PlatformsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly context: RequestContext,
    private readonly config: ApiConfig,
    private readonly inbox: MetricInboxSync,
    private readonly views: PlatformResponseAssembler,
  ) {}

  /** The three `/contas` cards, after the pulled batches are ingested (section 5.6). */
  @Get()
  async list(): Promise<PlatformsView> {
    await this.inbox.syncBeforeRead();
    return this.views.platforms(await this.queryBus.execute(new GetPlatformsQuery()));
  }

  /**
   * Section 5.3: only the owner opens or closes a gate. 409 `platform-publish-unsupported` for
   * Instagram `publish` (OD8); nothing is written on a refusal.
   */
  @Patch(`:platform/${apiRouteSegments.platformGate}`)
  @HttpCode(200)
  async changeGate(
    @Param(new ZodValidationPipe(PlatformParamsSchema)) params: PlatformParams,
    @Body(new ZodValidationPipe(GateChangeRequestSchema)) body: GateChangeRequest,
    @CurrentPrincipal() principal: Principal,
  ): Promise<PlatformView> {
    const view = await this.commandBus.execute(
      new SetPlatformGateCommand({ platform: params.platform, change: body, updatedBy: principal.subject, correlationId: this.context.correlationId() }),
    );
    return this.views.platform(view);
  }

  /**
   * Section 5.2 step 1: a single-use `state` and a PKCE verifier, kept in api memory and bound to
   * this session (core `InMemoryOAuthStateStore`: 10 minutes, at most 5 pending), and the authorize
   * URL whose `redirect_uri` uses the configured api port. 409 `platform-awaiting-review` or
   * `platform-not-configured`. Takes no body.
   */
  @Post(`:platform/${apiRouteSegments.platformConnection}`)
  @HttpCode(201)
  async startConnection(
    @Param(new ZodValidationPipe(PlatformParamsSchema)) params: PlatformParams,
    @CurrentPrincipal() principal: Principal,
  ): Promise<ConnectionStartView> {
    const view = await this.commandBus.execute(
      new StartConnectionCommand({
        platform: params.platform,
        sessionId: principal.sessionId,
        apiPort: this.config.port,
        correlationId: this.context.correlationId(),
      }),
    );
    return this.views.connectionStart(view);
  }

  /** Section 5.2 "token.lock": revoke (best effort), Keychain delete, `account.json` to `disconnected`; the answer names the revoke outcome. */
  @Delete(`:platform/${apiRouteSegments.platformConnection}`)
  @HttpCode(200)
  async disconnect(@Param(new ZodValidationPipe(PlatformParamsSchema)) params: PlatformParams): Promise<DisconnectResult> {
    const result = await this.commandBus.execute(new DisconnectCommand({ platform: params.platform, correlationId: this.context.correlationId() }));
    return this.views.disconnect(result);
  }
}
