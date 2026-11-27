import { type NextRequest } from 'next/server';
import { SITE_LINK_URL_MAX, siteLinkUrlFrom } from '@/features/catalog/site-link-draft';
import { serverStudioClient } from '@/lib/api/server';
import { checkSiteFraming } from '@/lib/bff/frame-check';
import { fetchSiteAllowed } from '@/lib/bff/fetch-site';
import { webConfig } from '@/lib/config/web-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function plain(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

async function hasSession(): Promise<boolean> {
  try {
    await serverStudioClient('throw').session();
    return true;
  } catch {
    return false;
  }
}

/**
 * `GET /api/enquadramento?link=<https URL>`: `{ "policy": "allowed" | "blocked" | "unknown" }`, whether a
 * saved website lets the studio show it in a frame. The server sends one HEAD request per redirect hop to
 * public addresses only and reads the framing headers; the page body is never fetched or returned.
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!fetchSiteAllowed(request.headers.get('sec-fetch-site'))) return plain(403, 'Acesso recusado.');
  if (!(await hasSession())) return plain(401, 'Sessão necessária.');
  const raw = request.nextUrl.searchParams.get('link') ?? '';
  const link = raw.length > SITE_LINK_URL_MAX ? null : siteLinkUrlFrom(raw);
  if (link === null) return plain(400, 'Link de site não aceito.');

  const policy = await checkSiteFraming(link, new URL(webConfig().webOrigin));
  return Response.json(
    { policy },
    // An unknown answer is often transient (slow site, network blip): the browser asks again next time.
    { headers: { 'Cache-Control': policy === 'unknown' ? 'no-store' : 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' } },
  );
}
