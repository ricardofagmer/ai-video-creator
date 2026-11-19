import 'server-only';
import { REQUEST_ID_HEADER, SESSION_COOKIE_NAME, type ApiErrorCode } from '@studio/shared/api';
import { CorrelationIdSchema } from '@studio/shared/run-format';
import { type NextRequest } from 'next/server';
import { webConfig } from '../config/web-config';
import { matchApiRoute, type ApiRoute } from '../api/route-table';

/**
 * Backend-for-frontend in front of the local api (R1-19). The browser never calls the api's port:
 * the api serves no CORS and refuses foreign origins. This forwards only C10 routes, only the
 * session cookie, and streams bodies under the api's own size caps. It never logs a cookie, a
 * passphrase or a body.
 */

const MIB = 1024 * 1024;
/** The api's JSON parser limit (`JSON_BODY_LIMIT = '1mb'`, apps/api/src/platform/api-config.ts). */
export const MAX_JSON_BODY_BYTES = 1 * MIB;
/**
 * The api refuses a declared multipart body above the largest per-kind store cap (2 GiB, core
 * `MAX_STORED_BYTES_BY_KIND`) plus 16 MiB of framing (apps/api catalog-upload.service.ts). The
 * BFF cap is that same number, never larger.
 */
export const MAX_MULTIPART_BODY_BYTES = 2 * 1024 * MIB + 16 * MIB;
const MAX_QUERY_LENGTH = 2048;
/** JSON calls are quick; an upload may take long, and the browser's disconnect cancels it. */
const JSON_CALL_TIMEOUT_MS = 30_000;
const UPLOAD_CALL_TIMEOUT_MS = 60 * 60 * 1000;

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD']);

/**
 * Response headers worth passing on, unchanged; everything else from the api stays behind. The
 * artifact route's `no-store`, `inline` disposition, `nosniff` and CSP sandbox reach the browser
 * as the api sent them (SPEC 0002 rev 4, section 13.5). `ETag` and `Last-Modified` are not on the
 * list, so nothing this proxy returns can be revalidated, and the proxy caches nothing itself.
 */
const FORWARDED_RESPONSE_HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'content-disposition',
  'cache-control',
  'x-content-type-options',
  'content-security-policy',
  REQUEST_ID_HEADER,
];

class BodyTooLargeError extends Error {
  constructor() {
    super('Request body exceeds the cap');
    this.name = 'BodyTooLargeError';
  }
}

function correlationIdOf(request: NextRequest): string {
  const supplied = CorrelationIdSchema.safeParse(request.headers.get(REQUEST_ID_HEADER) ?? '');
  return supplied.success ? supplied.data : crypto.randomUUID();
}

/** A C10 `ApiError` body for refusals made here, so the client parses every failure one way. */
function refusal(statusCode: number, code: ApiErrorCode, reason: string, correlationId: string): Response {
  return Response.json(
    { statusCode, code, reason, message: `Request refused by the web proxy: ${reason}`, correlationId },
    { status: statusCode, headers: { 'Cache-Control': 'no-store', [REQUEST_ID_HEADER]: correlationId } },
  );
}

function logEvent(event: string, fields: Readonly<Record<string, string | number>>): void {
  // Route id, status and correlation id only: never the URL, the query, a header or a body.
  process.stderr.write(`${JSON.stringify({ event, ...fields })}\n`);
}

/**
 * State-changing calls must come from the web's own pages. The api checks `Origin` too, but this
 * proxy replaces `Origin` with the web origin, so the browser's value is checked here first.
 */
function originAllowed(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method)) return true;
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  return request.headers.get('origin') === webConfig().webOrigin;
}

function sessionCookie(request: NextRequest): string | null {
  const session = request.cookies.get(SESSION_COOKIE_NAME);
  return session === undefined || session.value === '' ? null : `${SESSION_COOKIE_NAME}=${session.value}`;
}

function declaredLength(request: NextRequest): number | null {
  const header = request.headers.get('content-length');
  if (header === null) return null;
  const value = Number.parseInt(header, 10);
  return Number.isSafeInteger(value) ? value : null;
}

/** Counts bytes as they pass and fails the stream past the cap; nothing is buffered whole. */
function cappedStream(body: ReadableStream<Uint8Array>, maxBytes: number, overflow: { exceeded: boolean }): ReadableStream<Uint8Array> {
  let received = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > maxBytes) {
          overflow.exceeded = true;
          controller.error(new BodyTooLargeError());
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
}

type BodyPlan =
  | { kind: 'none' }
  | { kind: 'stream'; contentType: string; maxBytes: number }
  | { kind: 'refused'; statusCode: number; reason: string };

function planBody(request: NextRequest, route: ApiRoute): BodyPlan {
  if (route.body === 'none') return { kind: 'none' };
  const contentType = request.headers.get('content-type') ?? '';
  const expected = route.body === 'json' ? 'application/json' : 'multipart/form-data';
  if (!contentType.toLowerCase().startsWith(expected) || contentType.length > 200) {
    return { kind: 'refused', statusCode: 415, reason: 'unsupported-content-type' };
  }
  const maxBytes = route.maxBodyBytes ?? (route.body === 'json' ? MAX_JSON_BODY_BYTES : MAX_MULTIPART_BODY_BYTES);
  const declared = declaredLength(request);
  if (declared !== null && declared > maxBytes) return { kind: 'refused', statusCode: 413, reason: 'body-too-large' };
  return { kind: 'stream', contentType, maxBytes };
}

function upstreamHeaders(request: NextRequest, route: ApiRoute, plan: BodyPlan, correlationId: string): Headers {
  const headers = new Headers({ Accept: request.headers.get('accept') ?? 'application/json', [REQUEST_ID_HEADER]: correlationId });
  const cookie = sessionCookie(request);
  if (cookie !== null) headers.set('Cookie', cookie);
  if (!SAFE_METHODS.has(request.method)) headers.set('Origin', webConfig().webOrigin);
  if (plan.kind === 'stream') headers.set('Content-Type', plan.contentType);
  const range = request.headers.get('range');
  if (route.range && range !== null && range.length <= 100) headers.set('Range', range);
  return headers;
}

function downstreamResponse(upstream: Response, route: ApiRoute): Response {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  if (route.session) {
    for (const cookie of upstream.headers.getSetCookie()) {
      if (cookie.startsWith(`${SESSION_COOKIE_NAME}=`)) headers.append('Set-Cookie', cookie);
    }
  }
  const body = upstream.status === 204 || upstream.status === 304 ? null : upstream.body;
  return new Response(body, { status: upstream.status, headers });
}

export async function proxyToApi(request: NextRequest, segments: readonly string[]): Promise<Response> {
  const correlationId = correlationIdOf(request);
  const matched = matchApiRoute(request.method, segments);
  if (matched === null) return refusal(404, 'not_found', 'route-not-allowed', correlationId);
  const { route } = matched;
  if (!originAllowed(request)) return refusal(403, 'auth', 'origin-not-allowed', correlationId);

  const search = route.query ? request.nextUrl.search : '';
  if (search.length > MAX_QUERY_LENGTH) return refusal(414, 'validation', 'query-too-long', correlationId);

  const plan = planBody(request, route);
  if (plan.kind === 'refused') return refusal(plan.statusCode, 'validation', plan.reason, correlationId);

  const overflow = { exceeded: false };
  const timeoutMs = route.body === 'multipart' ? UPLOAD_CALL_TIMEOUT_MS : JSON_CALL_TIMEOUT_MS;
  const body = plan.kind === 'stream' && request.body !== null ? cappedStream(request.body, plan.maxBytes, overflow) : null;
  // `duplex: 'half'` lets Node's fetch send a streamed body; the DOM RequestInit type lacks it.
  const init: RequestInit & { duplex: 'half' } = {
    method: request.method,
    headers: upstreamHeaders(request, route, plan, correlationId),
    body,
    duplex: 'half',
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]),
  };

  let upstream: Response;
  try {
    upstream = await fetch(`${webConfig().apiBaseUrl}${matched.path}${search}`, init);
  } catch (error) {
    if (overflow.exceeded) return refusal(413, 'validation', 'body-too-large', correlationId);
    if (request.signal.aborted) return refusal(499, 'validation', 'client-closed-request', correlationId);
    logEvent('bff.api-unreachable', { route: route.id, correlationId, error: error instanceof Error ? error.name : 'unknown' });
    return refusal(503, 'dependency', 'api-unreachable', correlationId);
  }
  if (upstream.status >= 500) logEvent('bff.api-error', { route: route.id, status: upstream.status, correlationId });
  return downstreamResponse(upstream, route);
}
