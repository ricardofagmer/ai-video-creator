import { PlatformClientError, type PlatformClientOperation } from '../platform-client.errors';
import { isAllowedApiUrl } from './tiktok-endpoints';

/*
 * The one place the TikTok client touches the network, through the `fetch` of
 * `LivePlatformClientContext` only (K9). Redirects are never followed (SPEC 0007 section 6
 * "Outbound"): a 3xx comes back as a plain status the caller maps to a failure. Every call has a
 * timeout, and a response body is read up to a bound so a hostile answer cannot fill memory. A
 * transport failure becomes `network` with `transport: true`; nothing TikTok sends reaches an
 * error message (K7, K10).
 */

/** Ordinary API answers are small; anything larger is refused unread. */
const MAX_RESPONSE_BYTES = 256 * 1024;

/** A JSON API call never waits longer than this (rules: a timeout on every outbound call). */
export const JSON_CALL_TIMEOUT_MS = 30_000;

/** One chunk is at most about 64 MiB; this leaves room for a slow uplink inside the 1 h upload window. */
export const CHUNK_CALL_TIMEOUT_MS = 15 * 60_000;

/** What the client keeps of an answer: the status, a parsed `Retry-After`, and the bounded body text. */
export interface TiktokAnswer {
  status: number;
  retryAfterSeconds: number | null;
  /** Null when the body exceeded `MAX_RESPONSE_BYTES`. */
  text: string | null;
}

export interface TiktokCall {
  operation: PlatformClientOperation;
  url: URL;
  method: 'GET' | 'POST' | 'PUT';
  headers: Record<string, string>;
  body?: string | Uint8Array;
  timeoutMs: number;
  /** The metrics pass budget (finding C7); aborting it ends the call as `network`. */
  signal?: AbortSignal;
}

/** `Retry-After` in whole seconds; the HTTP-date form is ignored (TikTok documents neither). */
function parseRetryAfter(headers: Headers): number | null {
  const value = headers.get('retry-after');
  if (value === null || !/^[0-9]{1,6}$/.test(value.trim())) return null;
  return Number.parseInt(value.trim(), 10);
}

async function readBoundedText(response: Response): Promise<string | null> {
  const declared = response.headers.get('content-length');
  if (declared !== null && /^[0-9]+$/.test(declared) && Number.parseInt(declared, 10) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    return null;
  }
  if (response.body === null) return '';
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      return null;
    }
    parts.push(next.value);
  }
  return Buffer.concat(parts).toString('utf8');
}

/** Parses JSON text; a parse failure is reported without the text, which may hold token material. */
export function parseJsonText(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

export class TiktokHttp {
  constructor(private readonly fetchFunction: typeof fetch) {}

  /**
   * Sends one request. `allowUploadHost` is set only for a chunk PUT whose URL already passed
   * `parseAllowedUploadUrl`; every other URL must be on a fixed host. Rejects with `network`
   * (transport) when no answer arrives or the body breaks off.
   */
  async send(call: TiktokCall, allowUploadHost = false): Promise<TiktokAnswer> {
    if (!allowUploadHost && !isAllowedApiUrl(call.url)) {
      throw new PlatformClientError('tiktok', call.operation, 'invalid-response');
    }
    const timeout = AbortSignal.timeout(call.timeoutMs);
    const signal = call.signal === undefined ? timeout : AbortSignal.any([timeout, call.signal]);
    try {
      const response = await this.fetchFunction(call.url, {
        method: call.method,
        headers: call.headers,
        body: call.body,
        redirect: 'manual',
        signal,
      });
      const text = await readBoundedText(response);
      return { status: response.status, retryAfterSeconds: parseRetryAfter(response.headers), text };
    } catch {
      // A refused connection, a timeout, an abort or a broken body: no answer to read. The cause's
      // message can quote the URL, which may carry an upload token, so it is dropped (K7).
      throw new PlatformClientError('tiktok', call.operation, 'network', { transport: true, retryAfterSeconds: null });
    }
  }
}
