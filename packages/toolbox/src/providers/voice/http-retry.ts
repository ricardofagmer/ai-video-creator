import { setTimeout as sleep } from 'node:timers/promises';
import { ProviderError } from '../../errors';

export interface RetryPolicy {
  provider: string;
  attempts: number;
  baseDelayMs: number;
  timeoutMs: number;
  log: (message: string) => void;
}

// The request is a paid, non-idempotent POST: retry only when the server certainly did
// not do the work (rate limit, overloaded) or the connection never opened. Timeouts and
// other 5xx may already have been billed, so they fail instead of retrying.
const RETRYABLE_STATUSES = new Set([429, 503]);
const PRE_SEND_ERROR_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']);

function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

function failedBeforeSending(error: unknown): boolean {
  if (!(error instanceof Error) || !(error.cause instanceof Error)) return false;
  const code = 'code' in error.cause ? error.cause.code : undefined;
  return typeof code === 'string' && PRE_SEND_ERROR_CODES.has(code);
}

function backoffMs(policy: RetryPolicy, attempt: number, retryAfterHeader: string | null): number {
  const retryAfterS = retryAfterHeader ? Number.parseFloat(retryAfterHeader) : Number.NaN;
  if (Number.isFinite(retryAfterS) && retryAfterS > 0) return Math.min(retryAfterS * 1000, 30_000);
  const jitter = Math.floor(Math.random() * policy.baseDelayMs);
  return policy.baseDelayMs * 2 ** (attempt - 1) + jitter;
}

/**
 * fetch with retries for 429, 503 and connection failures, exponential backoff with jitter.
 * Other HTTP errors return immediately so the caller can report them. The request
 * init (and its headers, which may hold credentials) is never logged.
 */
export async function fetchWithRetry(url: string, init: RequestInit, policy: RetryPolicy): Promise<Response> {
  let lastProblem = 'no attempt made';
  for (let attempt = 1; attempt <= policy.attempts; attempt += 1) {
    let retryAfter: string | null = null;
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(policy.timeoutMs) });
      if (!isRetryableStatus(response.status)) return response;
      retryAfter = response.headers.get('retry-after');
      lastProblem = `HTTP ${response.status}`;
      await response.body?.cancel();
    } catch (error) {
      lastProblem = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      if (!failedBeforeSending(error)) {
        throw new ProviderError(`${policy.provider} request failed and was not retried because it may have been billed: ${lastProblem}`, policy.provider);
      }
    }
    if (attempt < policy.attempts) {
      const delay = backoffMs(policy, attempt, retryAfter);
      policy.log(`${policy.provider}: ${lastProblem}, retrying in ${Math.round(delay)} ms (attempt ${attempt + 1}/${policy.attempts})`);
      await sleep(delay);
    }
  }
  throw new ProviderError(`${policy.provider} request failed after ${policy.attempts} attempts: ${lastProblem}`, policy.provider);
}
