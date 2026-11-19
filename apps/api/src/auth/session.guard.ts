import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Request } from 'express';
import { UnauthenticatedError } from '../platform/api.errors';
import { OWNER_SUBJECT, RequestContext } from '../platform/request-context';
import { IS_PUBLIC_ROUTE } from './auth.decorators';
import { sessionTokensFrom } from './session-cookie';
import { SessionStore } from './session-store';

/**
 * Global guard (APP_GUARD): secure by default. Every route needs a valid session cookie unless
 * it is marked `@Public()` (D8, criterion 27: `health` and login only).
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionStore,
    private readonly context: RequestContext,
  ) {}

  canActivate(execution: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_ROUTE, [execution.getHandler(), execution.getClass()]);
    if (isPublic === true) return true;

    const request = execution.switchToHttp().getRequest<Request>();
    const nowMs = Date.now();
    for (const token of sessionTokensFrom(request.headers.cookie)) {
      const session = this.sessions.validate(token, nowMs);
      if (session !== null) {
        this.context.setPrincipal({ subject: OWNER_SUBJECT, sessionId: session.sessionId, expiresAt: session.expiresAt.toISOString() });
        return true;
      }
    }
    throw new UnauthenticatedError();
  }
}
