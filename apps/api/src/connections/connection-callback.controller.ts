import { Controller, Get, Header, Logger, Param, Query, Redirect } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { CompleteConnectionCommand } from '@studio/core/platforms';
import { PlatformParamsSchema, apiRouteSegments, type PlatformParams } from '@studio/shared/api';
import { CurrentPrincipal } from '../auth/auth.decorators';
import { ApiConfig } from '../platform/api-config';
import { RequestContext, type Principal } from '../platform/request-context';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { callbackQueryOf, callbackReasonOf, callbackRedirect, type CallbackRedirect } from './connection-callback.redirect';

/**
 * `GET /platforms/:platform/connection/callback` (SPEC 0007 sections 4.4 and 5.2 step 2, C10 rev 7).
 * The browser reaches it directly from the platform, so it is the only rev 7 row outside the BFF.
 * It keeps the global session guard (L6): `SameSite=Lax` sends the cookie on this top-level GET, and
 * a request without a session answers 401 before anything runs (AC 40, AC 62). A GET with a side
 * effect is accepted only with both the session and a single-use `state` bound to it; core
 * `CompleteConnection` checks the `state` first and stores nothing on any failure.
 *
 * Every outcome is a 303 to the web's `/contas` with a reason id only, `Cache-Control: no-store` and
 * `Referrer-Policy: no-referrer`, so neither the code nor the `state` can leak through a cache or a
 * `Referer`. `connectedBy` and the connect time come from the session and the server clock. Nothing
 * here logs the code, the `state`, a URL or an account label (K7); core logs the refusal reasons.
 */
@Controller(apiRouteSegments.platforms)
export class ConnectionCallbackController {
  private readonly logger = new Logger(ConnectionCallbackController.name);

  constructor(
    private readonly commandBus: CommandBus,
    private readonly config: ApiConfig,
    private readonly context: RequestContext,
  ) {}

  @Get(`:platform/${apiRouteSegments.platformConnection}/${apiRouteSegments.platformConnectionCallback}`)
  @Redirect()
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async complete(
    @Param(new ZodValidationPipe(PlatformParamsSchema)) params: PlatformParams,
    @Query() rawQuery: Readonly<Record<string, unknown>>,
    @CurrentPrincipal() principal: Principal,
  ): Promise<CallbackRedirect> {
    const correlationId = this.context.correlationId();
    const query = callbackQueryOf(rawQuery);
    if (query === null) {
      // Nothing identifies a pending `state`, so no command runs and nothing is consumed or stored.
      this.logger.log({ event: 'platform.connect-refused', platform: params.platform, reason: 'oauth-state-invalid', correlationId });
      return callbackRedirect({ webOrigin: this.config.webOrigin, result: 'falhou', reason: 'oauth-state-invalid' });
    }
    try {
      await this.commandBus.execute(
        new CompleteConnectionCommand({
          platform: params.platform,
          sessionId: principal.sessionId,
          apiPort: this.config.port,
          code: query.code ?? null,
          state: query.state ?? null,
          error: query.error ?? null,
          connectedBy: principal.subject,
          correlationId,
        }),
      );
      return callbackRedirect({ webOrigin: this.config.webOrigin, result: 'conectada', reason: null });
    } catch (error) {
      // Handled here, once: the browser gets the page, never a JSON body. Core already logged a
      // domain refusal by reason; anything else is logged by error name only (a message may hold a path).
      const reason = callbackReasonOf(error);
      if (reason === null) {
        this.logger.error({ event: 'platform.callback-failed', platform: params.platform, error: errorName(error), correlationId });
      }
      return callbackRedirect({ webOrigin: this.config.webOrigin, result: 'falhou', reason });
    }
  }
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}
