import { Injectable } from '@nestjs/common';
import { LoginRateLimitedError } from '../platform/api.errors';

/** Failed attempts allowed per window before login is refused until the window slides. */
export const MAX_FAILED_LOGINS = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export type LoginAttemptOutcome = 'accepted' | 'rejected';

/**
 * Login rate limit. Global rather than per client: every caller is 127.0.0.1, so a per-address
 * count would limit nothing. One verification runs at a time, which also bounds the argon2
 * memory a burst of requests can claim. The trade-off: a local process can lock the owner out
 * for one window; it cannot guess the passphrase faster.
 */
@Injectable()
export class LoginThrottle {
  private failures: number[] = [];
  private verifying = false;

  async attempt(nowMs: number, verify: () => Promise<boolean>): Promise<LoginAttemptOutcome> {
    this.failures = this.failures.filter((at) => nowMs - at < LOGIN_WINDOW_MS);
    const oldest = this.failures[0];
    if (this.failures.length >= MAX_FAILED_LOGINS && oldest !== undefined) {
      throw new LoginRateLimitedError(Math.max(1, Math.ceil((oldest + LOGIN_WINDOW_MS - nowMs) / 1000)));
    }
    if (this.verifying) throw new LoginRateLimitedError(1);
    this.verifying = true;
    try {
      const accepted = await verify();
      if (accepted) {
        this.failures = [];
        return 'accepted';
      }
      this.failures.push(nowMs);
      return 'rejected';
    } finally {
      this.verifying = false;
    }
  }
}
