import { NextResponse, type NextRequest } from 'next/server';
import { webConfig } from './lib/config/web-config';

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
  return NextResponse.next();
}

export const config = {
  matcher: '/:path*',
};
