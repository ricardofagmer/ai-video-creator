import { NextResponse, type NextRequest } from 'next/server';
import { webConfig } from './lib/config/web-config';

/** BFF and other route handlers: JSON or artifact bodies, never a document; the api sets the artifact CSP. */
const ROUTE_HANDLER_PREFIX = '/api/';

/**
 * Content-Security-Policy of every page (baseline review 2026-11-21). Scripts need the request's
 * nonce: Next reads it from this same header on the request (`getScriptNonceFromHeader`) and puts
 * it on its bootstrap and inline flight scripts; `'strict-dynamic'` then trusts the chunks those
 * scripts load. Every page is rendered per request (the layouts read the session cookie), so each
 * one gets a fresh nonce. Styles keep `'unsafe-inline'`: React writes `style` attributes
 * (`CostMeter`), which a nonce cannot cover, and injected CSS is a far smaller risk than script.
 * Development adds what `next dev` needs: `eval` for React Refresh and the HMR websocket.
 */
function contentSecurityPolicy(nonce: string): string {
  const isDevelopment = process.env.NODE_ENV === 'development';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self'",
    "media-src 'self'",
    "font-src 'self'",
    `connect-src 'self'${isDevelopment ? ' ws://127.0.0.1:* ws://localhost:*' : ''}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

function withContentSecurityPolicy(request: NextRequest): NextResponse {
  const policy = contentSecurityPolicy(btoa(crypto.randomUUID()));
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

/**
 * Criterion 23 and PRD 12: the listener is bound to 127.0.0.1 by the dev/start scripts, and loopback
 * is still not trusted on its own. A page on another site whose name resolves to 127.0.0.1 sends
 * its own name as Host (DNS rebinding); only the web's own loopback hosts are answered.
 */
export function middleware(request: NextRequest): NextResponse {
  const host = request.headers.get('host');
  if (host === null || !webConfig().allowedHosts.has(host.toLowerCase())) {
    return new NextResponse('Acesso recusado.', {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  if (request.nextUrl.pathname.startsWith(ROUTE_HANDLER_PREFIX)) return NextResponse.next();
  return withContentSecurityPolicy(request);
}

export const config = {
  matcher: '/:path*',
};
