import { randomUUID } from 'node:crypto';
import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { REQUEST_ID_HEADER } from '@studio/shared/api';
import { CorrelationIdSchema } from '@studio/shared/run-format';
import { type NextFunction, type Request, type Response } from 'express';
import { ApiConfig } from './api-config';
import { toErrorBody } from './api-exception.filter';
import { RequestContext } from './request-context';

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Opens the request context. `x-request-id` is external input: it is kept only when it matches
 * the C3 `CorrelationId` allowlist, otherwise a fresh id replaces it. Echoed on the response.
 */
@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  constructor(private readonly context: RequestContext) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const header = request.headers[REQUEST_ID_HEADER];
    const supplied = typeof header === 'string' ? CorrelationIdSchema.safeParse(header) : null;
    const correlationId = supplied !== null && supplied.success ? supplied.data : randomUUID();
    response.setHeader(REQUEST_ID_HEADER, correlationId);
    this.context.run({ correlationId, principal: null }, () => next());
  }
}

/** A JSON api with no HTML: nothing it returns may be framed, sniffed or cached. */
@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  use(_request: Request, response: Response, next: NextFunction): void {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; sandbox");
    response.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    next();
  }
}

/**
 * Loopback is not trusted on its own (PRD 12). The `Host` allowlist defeats DNS rebinding (a
 * remote page whose name resolves to 127.0.0.1 sends its own name as Host). For state-changing
 * methods, a browser `Origin` must be the web's or the api's own: `SameSite=Lax` treats every
 * port of 127.0.0.1 as the same site, so another local page could otherwise post with the cookie.
 * Clients without `Origin` (the CLI, the web's server-side proxy) carry no ambient browser cookie.
 */
@Injectable()
export class HostOriginMiddleware implements NestMiddleware {
  private readonly logger = new Logger(HostOriginMiddleware.name);

  constructor(
    private readonly config: ApiConfig,
    private readonly context: RequestContext,
  ) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const host = request.headers.host;
    if (host === undefined || !this.config.allowedHosts.has(host.toLowerCase())) {
      this.refuse(response, 'host-not-allowed');
      return;
    }
    if (!SAFE_METHODS.has(request.method)) {
      const origin = request.headers.origin;
      if (origin !== undefined && !this.config.allowedOrigins.has(origin)) {
        this.refuse(response, 'origin-not-allowed');
        return;
      }
      if (request.headers['sec-fetch-site'] === 'cross-site') {
        this.refuse(response, 'cross-site-request');
        return;
      }
    }
    next();
  }

  private refuse(response: Response, reason: string): void {
    const correlationId = this.context.correlationId() ?? randomUUID();
    this.logger.warn({ event: 'http.request-refused', reason, correlationId });
    const body = toErrorBody(
      { statusCode: 403, code: 'auth', reason, message: 'The request origin is not allowed', expected: true },
      correlationId,
    );
    response.status(403).json(body);
  }
}

function routeTemplate(request: Request): string {
  const route: unknown = request.route;
  if (typeof route === 'object' && route !== null && 'path' in route && typeof route.path === 'string') {
    return `${request.baseUrl}${route.path}`;
  }
  return 'unmatched';
}

/**
 * One line per request at the boundary (rules/observability.md): method, route template (never
 * the raw URL, query or headers, so no cookie, passphrase or artifact path is logged), status
 * and duration.
 */
@Injectable()
export class AccessLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger('Http');

  constructor(private readonly context: RequestContext) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = process.hrtime.bigint();
    // 'finish' listeners run outside the request's async context, so the id is captured now.
    const correlationId = this.context.correlationId();
    response.on('finish', () => {
      const durationMs = Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
      this.logger.log({
        event: 'http.request',
        method: request.method,
        route: routeTemplate(request),
        statusCode: response.statusCode,
        durationMs,
        correlationId,
      });
    });
    next();
  }
}
