import { Inject, Injectable } from '@nestjs/common';
import { type ComponentState } from '@studio/shared/api';
import { ApiConfig } from '../../platform/api-config';

/** Whether a loopback HTTP server answered at all; the body is never read. */
export type HttpReachability = 'answered' | 'refused' | 'timed-out' | 'failed';

export interface LoopbackHttpProber {
  reach(url: string): Promise<HttpReachability>;
}

export const LOOPBACK_HTTP_PROBER = Symbol('LOOPBACK_HTTP_PROBER');

const PROBE_TIMEOUT_MS = 2000;

function reachabilityOf(error: unknown): HttpReachability {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return 'timed-out';
  const cause = error instanceof Error ? error.cause : undefined;
  if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'ECONNREFUSED') return 'refused';
  return 'failed';
}

/** One GET, no credentials, no redirect followed; the response body is discarded unread. */
export const fetchLoopbackHttpProber: LoopbackHttpProber = {
  reach: async (url) => {
    try {
      const response = await fetch(url, { redirect: 'manual', credentials: 'omit', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
      await response.body?.cancel();
      return 'answered';
    } catch (error) {
      return reachabilityOf(error);
    }
  },
};

/**
 * The studio web at its configured loopback origin (`ApiConfig.webOrigin`, loopback by schema): any
 * HTTP answer is `ok`, a refused connection `stopped`, a timeout or other failure `degraded`.
 */
@Injectable()
export class WebProbe {
  constructor(
    private readonly config: ApiConfig,
    @Inject(LOOPBACK_HTTP_PROBER) private readonly prober: LoopbackHttpProber,
  ) {}

  async probe(): Promise<ComponentState> {
    const reachability = await this.prober.reach(`${this.config.webOrigin}/`);
    switch (reachability) {
      case 'answered':
        return 'ok';
      case 'refused':
        return 'stopped';
      case 'timed-out':
      case 'failed':
        return 'degraded';
    }
  }
}
