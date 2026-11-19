import { type MockFaultScenario } from '@studio/shared/ports';
import { type ProviderName } from '@studio/shared/run-format';

/**
 * What a provider adapter observed when a call failed: status codes and error codes only, never
 * the response body or the request (either can echo a key or user content).
 */
export interface ProviderErrorSignal {
  provider: ProviderName;
  /** HTTP status of the provider response; null when no response arrived. */
  httpStatus: number | null;
  /** Raw `retry-after` header value, when the response carried one. */
  retryAfter: string | null;
  /** Node or undici error code (`ECONNRESET`, `UND_ERR_SOCKET`, ...) when no response arrived. */
  networkCode: string | null;
  /** The step's AbortSignal fired (step timeout or `stop`). */
  aborted: boolean;
}

/**
 * Typed failure classes the engine acts on (criterion 16, ADR 0002 "Retries"):
 * - `authentication`: never retried, no Recovery call; the run goes to `waiting`.
 * - `rate-limit`: 429 and 529, retried on the 30 s / 2 min / 10 min ladder honouring `retry-after`.
 * - `transient`: server errors and network drops; retried within `limits.attemptsPerStep`.
 * - `cancelled`: the step signal aborted the call; the engine decides between timeout and stop.
 * - `fatal`: the request itself is wrong; repeating it unchanged cannot succeed.
 */
export type ProviderFailure =
  | { class: 'authentication'; provider: ProviderName }
  | { class: 'rate-limit'; provider: ProviderName; retryAfterMs: number | null }
  | { class: 'transient'; provider: ProviderName; reason: 'server-error' | 'network' }
  | { class: 'cancelled'; provider: ProviderName }
  | { class: 'fatal'; provider: ProviderName; reason: 'rejected-request' | 'unrecognized' };

export type ProviderFailureClass = ProviderFailure['class'];

/** Upper bound of the retry ladder (ADR 0002); a longer `retry-after` is clamped to it. */
export const MAX_RETRY_AFTER_MS = 10 * 60 * 1000;

const AUTHENTICATION_STATUSES: ReadonlySet<number> = new Set([401, 403]);
const RATE_LIMIT_STATUSES: ReadonlySet<number> = new Set([429, 529]);
const TRANSIENT_CLIENT_STATUSES: ReadonlySet<number> = new Set([408, 409]);
const TRANSIENT_NETWORK_CODES: ReadonlySet<string> = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
  'ENOTFOUND',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
]);

/** `retry-after` as delta-seconds or an HTTP date (RFC 9110 10.2.3); null when unusable. */
export function parseRetryAfterMs(retryAfter: string | null, now: Date): number | null {
  if (retryAfter === null) return null;
  const text = retryAfter.trim();
  if (/^\d{1,7}$/.test(text)) return Math.min(Number.parseInt(text, 10) * 1000, MAX_RETRY_AFTER_MS);
  const at = Date.parse(text);
  if (Number.isNaN(at)) return null;
  return Math.min(Math.max(at - now.getTime(), 0), MAX_RETRY_AFTER_MS);
}

/** Pure classification; unrecognized signals are `fatal`, so nothing is retried blindly. */
export function classifyProviderFailure(signal: ProviderErrorSignal, now: Date): ProviderFailure {
  const { provider, httpStatus } = signal;
  if (signal.aborted) return { class: 'cancelled', provider };
  if (httpStatus !== null) {
    if (AUTHENTICATION_STATUSES.has(httpStatus)) return { class: 'authentication', provider };
    if (RATE_LIMIT_STATUSES.has(httpStatus)) {
      return { class: 'rate-limit', provider, retryAfterMs: parseRetryAfterMs(signal.retryAfter, now) };
    }
    if (httpStatus >= 500 || TRANSIENT_CLIENT_STATUSES.has(httpStatus)) {
      return { class: 'transient', provider, reason: 'server-error' };
    }
    if (httpStatus >= 400) return { class: 'fatal', provider, reason: 'rejected-request' };
    return { class: 'fatal', provider, reason: 'unrecognized' };
  }
  if (signal.networkCode !== null && TRANSIENT_NETWORK_CODES.has(signal.networkCode)) {
    return { class: 'transient', provider, reason: 'network' };
  }
  return { class: 'fatal', provider, reason: 'unrecognized' };
}

/**
 * The signal a mock adapter raises for a SPEC 0002 A12 fault scenario. Only the authentication
 * scenario is a provider error; the other scenarios are step outcomes the mock produces itself.
 */
export function mockFaultSignal(provider: ProviderName, fault: MockFaultScenario): ProviderErrorSignal | null {
  if (fault !== 'authentication-error') return null;
  return { provider, httpStatus: 401, retryAfter: null, networkCode: null, aborted: false };
}
