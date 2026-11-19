import { Body, Controller, Get, Headers, HttpCode, Post, Res } from '@nestjs/common';
import { LoginRequestSchema, apiRouteSegments, type LoginRequest, type SessionResponse } from '@studio/shared/api';
import { type Response } from 'express';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { type Principal } from '../platform/request-context';
import { CurrentPrincipal, Public } from './auth.decorators';
import { AuthService } from './auth.service';
import { serializeClearedSessionCookie, serializeSessionCookie } from './session-cookie';

@Controller(apiRouteSegments.auth)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** One of the two public routes (criterion 27). The body is never logged. */
  @Public()
  @Post(apiRouteSegments.login)
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(LoginRequestSchema)) body: LoginRequest,
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const issued = await this.auth.login(body.passphrase, cookieHeader);
    response.setHeader('Set-Cookie', serializeSessionCookie(issued.token));
    return { authenticated: true, expiresAt: issued.expiresAt.toISOString() };
  }

  @Post(apiRouteSegments.logout)
  @HttpCode(204)
  logout(@CurrentPrincipal() principal: Principal, @Res({ passthrough: true }) response: Response): void {
    this.auth.logout(principal.sessionId);
    response.setHeader('Set-Cookie', serializeClearedSessionCookie());
  }

  @Get(apiRouteSegments.session)
  session(@CurrentPrincipal() principal: Principal): SessionResponse {
    return { authenticated: true, expiresAt: principal.expiresAt };
  }
}
