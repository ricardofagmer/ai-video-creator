import { type z } from 'zod';
import { type SecretToken } from '../../token-bundle';
import { PlatformClientError, type PlatformClientOperation } from '../platform-client.errors';
import { INSTAGRAM_ALLOWED_HOSTS, INSTAGRAM_HOSTS, instagramRequestBounds } from './instagram.constants';
import { reasonForFailure, type InstagramHttpFailure } from './instagram-errors';
import { GraphErrorResponseSchema, OAuthErrorResponseSchema } from './instagram.schemas';

/*
 * The one place the Instagram client touches the network (K6), through the `fetch` the registry
 * injects (K9). Every request goes to a fixed host of the allowlist over `https`, follows no
 * redirect, has a timeout, and reads at most `maxResponseBytes`. Tokens and the app secret travel
 * only in the `Authorization` header or a form body, never in the URL (K3); the URL holds only
 * field lists, metric names, limits and paging cursors.
 */

export type InstagramHost = keyof typeof INSTAGRAM_HOSTS;

export interface InstagramRequest {
  operation: PlatformClientOperation;
  method: 'GET' | 'POST';
  host: InstagramHost;
  path: string;
  /** Public parameters only: never a token, code, secret or `state`. */
  query?: Readonly<Record<string, string>>;
  /** Form body; the only place a code or the app secret may go. */
  form?: Readonly<Record<string, string>>;
  bearer?: SecretToken;
  /** The caller's stop signal (the metrics pass budget, finding C7). */
  signal?: AbortSignal;
}

export type InstagramOutcome = { status: 'ok'; body: unknown } | { status: 'failed'; failure: InstagramHttpFailure };

const MAX_RETRY_AFTER_SECONDS = 172_800;

function parseRetryAfter(header: string | null, now: number): number | null {
  if (header === null) return null;
  const text = header.trim();
  if (/^[0-9]{1,9}$/.test(text)) return Math.min(Number.parseInt(text, 10), MAX_RETRY_AFTER_SECONDS);
  const at = Date.parse(text);
  if (Number.isNaN(at)) return null;
  return Math.min(Math.max(Math.ceil((at - now) / 1_000), 0), MAX_RETRY_AFTER_SECONDS);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // The parser's message can quote the body; the answer is simply not JSON.
    return undefined;
  }
}

/** The numbers of an error body; text fields are parsed by the allowlist and never read. */
function errorCodesOf(body: unknown): { code: number | null; subcode: number | null } {
  const graph = GraphErrorResponseSchema.safeParse(body);
  if (graph.success) return { code: graph.data.error.code, subcode: graph.data.error.error_subcode ?? null };
  const oauth = OAuthErrorResponseSchema.safeParse(body);
  if (oauth.success) return { code: oauth.data.code, subcode: null };
  return { code: null, subcode: null };
}

export class InstagramHttp {
  constructor(private readonly fetchFunction: typeof fetch) {}

  /** Sends one request; a non-2xx answer comes back as a failure, a transport fault throws `network`. */
  async send(request: InstagramRequest): Promise<InstagramOutcome> {
    const url = this.buildUrl(request);
    if (request.signal?.aborted === true) throw this.error(request.operation, 'network', false);
    const timeout = AbortSignal.timeout(instagramRequestBounds.timeoutMs);
    const signal = request.signal === undefined ? timeout : AbortSignal.any([request.signal, timeout]);
    let response: Response;
    try {
      response = await this.fetchFunction(url, { method: request.method, headers: this.headers(request), body: this.body(request), redirect: 'manual', signal });
    } catch {
      // Connection refused, DNS, TLS, timeout or the pass budget: one reason, no platform text.
      throw this.error(request.operation, 'network', true);
    }
    // K6 and section 6: no redirect is followed, to another host or the same one.
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
      await response.body?.cancel();
      throw this.error(request.operation, 'invalid-response', false);
    }
    const text = await this.readBounded(response, request.operation);
    const body = text === null ? undefined : parseJson(text);
    if (response.ok) {
      if (body === undefined) throw this.error(request.operation, 'invalid-response', false);
      return { status: 'ok', body };
    }
    const codes = errorCodesOf(body);
    return {
      status: 'failed',
      failure: { httpStatus: response.status, ...codes, retryAfterSeconds: parseRetryAfter(response.headers.get('retry-after'), Date.now()) },
    };
  }

  /** Sends and parses a success with `schema`; any failure throws its mapped reason. */
  async sendParsed<Schema extends z.ZodTypeAny>(request: InstagramRequest, schema: Schema): Promise<z.output<Schema>> {
    const outcome = await this.send(request);
    if (outcome.status === 'failed') throw this.failureError(request.operation, outcome.failure);
    return this.parse(request.operation, outcome.body, schema);
  }

  parse<Schema extends z.ZodTypeAny>(operation: PlatformClientOperation, body: unknown, schema: Schema): z.output<Schema> {
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw this.error(operation, 'invalid-response', false);
    return parsed.data;
  }

  failureError(operation: PlatformClientOperation, failure: InstagramHttpFailure): PlatformClientError {
    return new PlatformClientError('instagram', operation, reasonForFailure(operation, failure), {
      transport: false,
      retryAfterSeconds: failure.retryAfterSeconds,
    });
  }

  private buildUrl(request: InstagramRequest): URL {
    const url = new URL(`https://${INSTAGRAM_HOSTS[request.host]}${request.path}`);
    for (const [name, value] of Object.entries(request.query ?? {})) url.searchParams.set(name, value);
    // Defence in depth: a path can never move the request off the allowlist or off `https`.
    if (url.protocol !== 'https:' || !INSTAGRAM_ALLOWED_HOSTS.includes(url.hostname) || url.username !== '' || url.port !== '') {
      throw this.error(request.operation, 'invalid-response', false);
    }
    return url;
  }

  private headers(request: InstagramRequest): Record<string, string> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (request.bearer !== undefined) headers.authorization = `Bearer ${request.bearer.revealForPlatformCall()}`;
    if (request.form !== undefined) headers['content-type'] = 'application/x-www-form-urlencoded';
    return headers;
  }

  private body(request: InstagramRequest): string | undefined {
    if (request.form === undefined) return undefined;
    return new URLSearchParams(Object.entries(request.form)).toString();
  }

  /** The body as text, or null when it exceeds the bound; a broken stream is `network`. */
  private async readBounded(response: Response, operation: PlatformClientOperation): Promise<string | null> {
    const declared = response.headers.get('content-length');
    if (declared !== null && Number.parseInt(declared, 10) > instagramRequestBounds.maxResponseBytes) {
      await response.body?.cancel();
      return null;
    }
    if (response.body === null) return '';
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!(value instanceof Uint8Array)) {
          await reader.cancel();
          return null;
        }
        total += value.byteLength;
        if (total > instagramRequestBounds.maxResponseBytes) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }
    } catch {
      // A body cut mid-read (timeout, reset, pass budget) is a transport fault.
      throw this.error(operation, 'network', true);
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  private error(operation: PlatformClientOperation, reason: ConstructorParameters<typeof PlatformClientError>[2], transport: boolean): PlatformClientError {
    return new PlatformClientError('instagram', operation, reason, { transport, retryAfterSeconds: null });
  }
}
