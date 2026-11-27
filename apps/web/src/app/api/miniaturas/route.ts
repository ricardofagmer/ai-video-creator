import { type NextRequest } from 'next/server';
import { videoLinkFrom } from '@/features/catalog/video-link';
import { serverStudioClient } from '@/lib/api/server';
import { fetchSiteAllowed } from '@/lib/bff/fetch-site';
import { loadVideoThumbnail } from '@/lib/bff/video-thumbnail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LINK_LENGTH = 300;

/** Neutral play mark shown when the platform gives no thumbnail; the card's muted surface shows behind it. */
const PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90" width="160" height="90">' +
  '<circle cx="80" cy="45" r="18" fill="#8a8a93" fill-opacity="0.35"/>' +
  '<path d="M74 36l14 9-14 9z" fill="#8a8a93" fill-opacity="0.9"/></svg>';

/** The body is an image, never a document: nothing in it may run or load anything. */
const IMAGE_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  'X-Content-Type-Options': 'nosniff',
};

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
 * `GET /api/miniaturas?link=<post URL>`: the thumbnail of a saved video
 * reference, fetched by the server from the platform and served from this origin, so the page CSP
 * keeps `img-src 'self'`. The link passes the same allowlist parser as the catalog's link box.
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!fetchSiteAllowed(request.headers.get('sec-fetch-site'))) return plain(403, 'Acesso recusado.');
  if (!(await hasSession())) return plain(401, 'Sessão necessária.');
  const raw = request.nextUrl.searchParams.get('link') ?? '';
  const link = raw.length > MAX_LINK_LENGTH ? null : videoLinkFrom(raw);
  if (link === null || link.status !== 'supported') return plain(400, 'Link de vídeo não aceito.');

  const image = await loadVideoThumbnail(link.post);
  if (image === null) {
    return new Response(PLACEHOLDER_SVG, {
      status: 200,
      headers: { ...IMAGE_HEADERS, 'Content-Type': 'image/svg+xml', 'Cache-Control': 'private, max-age=300' },
    });
  }
  return new Response(image.bytes, {
    status: 200,
    headers: { ...IMAGE_HEADERS, 'Content-Type': image.contentType, 'Cache-Control': 'private, max-age=3600' },
  });
}
