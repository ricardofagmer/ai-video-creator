import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { apiPaths } from '@studio/shared/api';
import { type NextFunction, type Request, type Response } from 'express';
import { ApiConfig } from '../platform/api-config';
import { RequestContext } from '../platform/request-context';

/** C1: the verb each install route answers; the preflight admits only that verb. */
const INSTALL_ROUTE_METHODS: ReadonlyMap<string, string> = new Map([
  [apiPaths.installPresence(), 'GET'],
  [apiPaths.installPair(), 'POST'],
  [apiPaths.installStatus(), 'GET'],
]);

const ALLOWED_METHODS = 'GET, POST';
const ALLOWED_HEADERS: ReadonlySet<string> = new Set(['authorization', 'content-type']);
const PREFLIGHT_MAX_AGE_SECONDS = '600';
const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

export type InstallRefusal = 'host-not-allowed' | 'origin-not-allowed' | 'cross-site-request' | 'preflight-refused';

/** The request path without query, as the client sent it (Express may strip a mount prefix from `path`). */
function requestPathname(request: Request): string {
  return new URL(request.originalUrl, 'http://127.0.0.1').pathname;
}

/** True when every header a preflight asks for is one C1 allows. */
export function requestedHeadersAllowed(header: string | undefined): boolean {
  if (header === undefined || header.trim() === '') return true;
  return header.split(',').every((name) => ALLOWED_HEADERS.has(name.trim().toLowerCase()));
}

/**
 * The trust boundary of `/install/*` (C1 rev 2, plan rev 3 section 9, ADR 0010 decision 6). It
 * replaces the global Host and Origin middleware on these paths only, with stricter rules:
 *
 * - `Host` must be the api's own loopback host and port (not the web's); anything else is 421, so
 *   a rebinding page whose name resolves to 127.0.0.1 is refused (DI-AC-09).
 * - `Access-Control-Allow-Origin` is sent only to the exact configured portal origin and only on
 *   the three C1 routes; `Access-Control-Allow-Credentials` is never sent (DI-AC-08). Unset portal
 *   origin: no cross-origin caller is accepted.
 * - The portal's preflight answers 204 with Allow-Methods `GET, POST`, Allow-Headers
 *   `authorization, content-type` and Max-Age 600, and only when it asks for the route's one verb;
 *   any other preflight is 403 with no allow header (DI-AC-26). Every answer carries
 *   `Vary: Origin`. `Access-Control-Allow-Private-Network` is never sent: vetting 0006 settled
 *   loopback access on the portal side (`targetAddressSpace: 'loopback'`), not by this header.
 * - A state-changing request from a browser must come from the portal, the web or the api itself,
 *   as everywhere else in the api.
 *
 * Refusals carry no body; logs carry the reason only, never a header value.
 */
@Injectable()
export class InstallBoundaryMiddleware implements NestMiddleware {
  private readonly logger = new Logger(InstallBoundaryMiddleware.name);

  constructor(
    private readonly config: ApiConfig,
    private readonly context: RequestContext,
  ) {}

  use(request: Request, response: Response, next: NextFunction): void {
    // Every answer depends on Origin, refusals included, so no cache may reuse one across origins.
    response.vary('Origin');
    const host = request.headers.host;
    if (host === undefined || !this.config.installHosts.has(host.toLowerCase())) {
      this.refuse(response, 421, 'host-not-allowed');
      return;
    }
    const routeMethod = INSTALL_ROUTE_METHODS.get(requestPathname(request));
    const origin = request.headers.origin;
    const portalOrigin = this.config.install.portalOrigin;
    const fromPortal = routeMethod !== undefined && portalOrigin !== null && origin === portalOrigin;
    if (fromPortal) response.setHeader('Access-Control-Allow-Origin', portalOrigin);

    if (request.method === 'OPTIONS') {
      this.answerPreflight(request, response, fromPortal ? routeMethod : undefined);
      return;
    }
    if (!SAFE_METHODS.has(request.method) && !fromPortal) {
      if (origin !== undefined && !this.config.allowedOrigins.has(origin)) {
        this.refuse(response, 403, 'origin-not-allowed');
        return;
      }
      if (request.headers['sec-fetch-site'] === 'cross-site') {
        this.refuse(response, 403, 'cross-site-request');
        return;
      }
    }
    next();
  }

  private answerPreflight(request: Request, response: Response, routeMethod: string | undefined): void {
    const requestedMethod = request.headers['access-control-request-method'];
    const requestedHeaders = request.headers['access-control-request-headers'];
    if (routeMethod === undefined || requestedMethod !== routeMethod || !requestedHeadersAllowed(requestedHeaders)) {
      response.removeHeader('Access-Control-Allow-Origin');
      this.refuse(response, 403, 'preflight-refused');
      return;
    }
    response.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
    response.setHeader('Access-Control-Allow-Headers', [...ALLOWED_HEADERS].join(', '));
    response.setHeader('Access-Control-Max-Age', PREFLIGHT_MAX_AGE_SECONDS);
    response.status(204).end();
  }

  private refuse(response: Response, statusCode: 403 | 421, reason: InstallRefusal): void {
    this.logger.warn({ event: 'install.request-refused', reason, correlationId: this.context.correlationId() });
    response.status(statusCode).end();
  }
}
