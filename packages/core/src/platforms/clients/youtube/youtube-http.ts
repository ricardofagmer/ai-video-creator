import { type z } from 'zod';
import { PlatformClientError, type PlatformClientErrorReason, type PlatformClientOperation } from '../platform-client.errors';
import { YOUTUBE_ALLOWED_HOSTS, YOUTUBE_MAX_RESPONSE_BYTES } from './youtube.constants';

/*
 * The one door to the network for the YouTube client (SPEC 0007 K6, K7, K9, K10). Every request:
 * - goes to an `https` URL on one of the four allowlisted hosts, default port, no credentials in it;
 * - is sent with `redirect: 'manual'`, and any 3xx is refused except the resumable protocol's
 *   `308 Resume Incomplete` with no `Location` (which is not a redirect at all);
 * - carries a timeout, combined with the caller's abort signal;
 * - has its body read up to a byte bound and parsed by a strict zod schema before use.
 * Nothing here logs, and no error carries a URL, header, body or platform text.
 */

export interface YoutubeHttpRequest {
  operation: PlatformClientOperation;
  url: URL;
  method: 'GET' | 'POST' | 'PUT';
  headers: Record<string, string>;
  body?: string | Uint8Array;
  timeoutMs: number;
  signal?: AbortSignal;
  /** Only the resumable upload accepts `308 Resume Incomplete`. */
  acceptResumeIncomplete?: boolean;
}

/** Builds the client's error; every failure in this folder goes through it. */
export function youtubeError(
  operation: PlatformClientOperation,
  reason: PlatformClientErrorReason,
  details: { transport?: boolean; retryAfterSeconds?: number | null } = {},
): PlatformClientError {
  return new PlatformClientError('youtube', operation, reason, {
    transport: details.transport ?? false,
    retryAfterSeconds: details.retryAfterSeconds ?? null,
  });
}

/** True when `url` may be contacted (K6): `https`, allowlisted host, no port, no user info. */
export function isAllowedYoutubeUrl(url: URL): boolean {
  return url.protocol === 'https:' && url.port === '' && url.username === '' && url.password === '' && YOUTUBE_ALLOWED_HOSTS.includes(url.hostname);
}

function isRedirect(response: Response, acceptResumeIncomplete: boolean): boolean {
  if (response.status < 300 || response.status > 399) return false;
  return !(acceptResumeIncomplete && response.status === 308 && response.headers.get('location') === null);
}

/**
 * Sends one request. A transport failure (no answer) rejects with `network` marked `transport`; an
 * abort by the caller's signal rejects with `network` not marked, so it is never resumed.
 */
/** Read through a call so the check after `fetch` is not narrowed by the one before it. */
function abortedByCaller(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

export async function sendYoutubeRequest(fetchFn: typeof fetch, request: YoutubeHttpRequest): Promise<Response> {
  if (!isAllowedYoutubeUrl(request.url)) throw youtubeError(request.operation, 'invalid-response');
  if (abortedByCaller(request.signal)) throw youtubeError(request.operation, 'network');
  const timeout = AbortSignal.timeout(request.timeoutMs);
  const signal = request.signal === undefined ? timeout : AbortSignal.any([request.signal, timeout]);
  let response: Response;
  try {
    response = await fetchFn(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'manual',
      signal,
    });
  } catch {
    // The transport's message can carry the URL; only the fact of the failure is kept.
    throw youtubeError(request.operation, 'network', { transport: !abortedByCaller(request.signal) });
  }
  if (isRedirect(response, request.acceptResumeIncomplete === true)) {
    await discardBody(response);
    throw youtubeError(request.operation, 'invalid-response');
  }
  return response;
}

/** Releases an unread body so the connection can be reused. */
export async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Cancelling an already-closed stream fails harmlessly; nothing in it is needed.
  }
}

/** Reads at most `YOUTUBE_MAX_RESPONSE_BYTES`; a longer body is refused, never truncated and parsed. */
async function readBoundedText(response: Response, operation: PlatformClientOperation): Promise<string> {
  if (response.body === null) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > YOUTUBE_MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw youtubeError(operation, 'invalid-response');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof PlatformClientError) throw error;
    throw youtubeError(operation, 'network', { transport: true });
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** The body as JSON, or `undefined` when it is empty or not JSON (an error page, for instance). */
export async function readJsonBody(response: Response, operation: PlatformClientOperation): Promise<unknown> {
  const text = await readBoundedText(response, operation);
  if (text.trim().length === 0) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    // The parser's message quotes the input, which is platform text: the body is dropped.
    return undefined;
  }
}

/** Reads and parses a success body; anything outside the schema is `invalid-response`. */
export async function parseYoutubeBody<Schema extends z.ZodType>(
  response: Response,
  schema: Schema,
  operation: PlatformClientOperation,
): Promise<z.infer<Schema>> {
  const parsed = schema.safeParse(await readJsonBody(response, operation));
  if (!parsed.success) throw youtubeError(operation, 'invalid-response');
  return parsed.data;
}

/** The longest wait a `Retry-After` may impose: two days, so a hostile answer cannot park a platform. */
const MAX_RETRY_AFTER_SECONDS = 172_800;

/** `Retry-After` as whole seconds (delta-seconds or an HTTP date), capped at two days, or null ([section 5.7]). */
export function retryAfterSeconds(response: Response, now: Date): number | null {
  const header = response.headers.get('retry-after');
  if (header === null) return null;
  const trimmed = header.trim();
  if (/^[0-9]{1,7}$/.test(trimmed)) return Math.min(Number.parseInt(trimmed, 10), MAX_RETRY_AFTER_SECONDS);
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return null;
  return Math.min(Math.max(0, Math.ceil((at - now.getTime()) / 1000)), MAX_RETRY_AFTER_SECONDS);
}

/** The `Authorization` header of a data call; the token never appears in a URL (K3). */
export function bearerHeaders(accessToken: string): Record<string, string> {
  return { authorization: `Bearer ${accessToken}`, accept: 'application/json' };
}
