import { setTimeout as delay } from 'node:timers/promises';
import { ProviderCallError } from '../agents.errors';

/** ADR 0002 "Retries": eng-grafo's ladder, 30 s, 2 min, 10 min; `retry-after` wins when sent. */
export const RATE_LIMIT_LADDER_MS: readonly number[] = [30_000, 120_000, 600_000];

export interface RateLimitRetryOptions<T> {
  readonly attempt: () => Promise<T>;
  readonly signal: AbortSignal;
  /** Epoch ms of the call's timeout: a wait that would end past it cannot succeed. */
  readonly deadlineMs: number;
  readonly onWait?: (waitMs: number, retry: number) => void;
}

/**
 * Retries only `rate-limit` failures (429, 529), inside the call's timeout and abort signal.
 * Authentication, fatal and every other failure propagate at once (criterion 16). The wait is
 * abortable, so an engine `stop` never sits out a ten-minute rung.
 */
export async function withRateLimitRetry<T>(options: RateLimitRetryOptions<T>): Promise<T> {
  for (let retry = 0; ; retry += 1) {
    try {
      return await options.attempt();
    } catch (error) {
      if (!(error instanceof ProviderCallError) || error.failure.class !== 'rate-limit') throw error;
      const rungMs = RATE_LIMIT_LADDER_MS[retry];
      if (rungMs === undefined) throw error;
      const waitMs = error.failure.retryAfterMs ?? rungMs;
      if (Date.now() + waitMs >= options.deadlineMs) throw error;
      options.onWait?.(waitMs, retry + 1);
      await delay(waitMs, undefined, { signal: options.signal });
    }
  }
}
