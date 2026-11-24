import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  INSTALL_CLOCK,
  INSTALL_RANDOM_SOURCE,
  InstallCredentialsRepository,
  matchesAnyDigest,
  newInstallToken,
  newRowId,
  sha256Hex,
  type InstallClock,
  type InstallRandomSource,
} from '@studio/core/install';
import { InstallPairRequestSchema, PAIR_CODE_MAX_FAILED_ATTEMPTS, type InstallPairing } from '@studio/shared/api';
import { RequestContext } from '../platform/request-context';
import { PairThrottle } from './credentials/pair-throttle';
import { InstallUnauthorizedError } from './install.errors';

type CodeCheck = { outcome: 'valid'; pairCodeId: string } | { outcome: 'invalid' };

/**
 * `POST /install/pair` (C1, DI-AC-11, DI-AC-12): exchanges the pending one-time code for a portal
 * token. The code is valid for 5 minutes, once, and is deleted on its fifth failed attempt; at
 * most five failures a minute are checked at all. Every refusal is the same 401. Logs carry the
 * outcome only, never the code or the token.
 */
@Injectable()
export class InstallPairingService {
  private readonly logger = new Logger(InstallPairingService.name);

  constructor(
    private readonly credentials: InstallCredentialsRepository,
    private readonly throttle: PairThrottle,
    private readonly context: RequestContext,
    @Inject(INSTALL_CLOCK) private readonly clock: InstallClock,
    @Inject(INSTALL_RANDOM_SOURCE) private readonly random: InstallRandomSource,
  ) {}

  /** `body` is unvalidated input: a malformed body counts as a failed attempt, not a 400. */
  async pair(body: unknown): Promise<InstallPairing> {
    const now = this.clock.now();
    const attempt = await this.throttle.attempt(
      now.getTime(),
      () => this.check(body, now),
      (checked) => checked.outcome === 'valid',
    );
    const correlationId = this.context.correlationId();
    if (attempt.outcome === 'throttled') {
      this.logger.warn({ event: 'install.pair-refused', outcome: 'throttled', correlationId });
      throw new InstallUnauthorizedError();
    }
    const checked = attempt.result;
    if (checked.outcome !== 'valid') {
      this.logger.warn({ event: 'install.pair-refused', outcome: 'invalid-code', correlationId });
      throw new InstallUnauthorizedError();
    }
    const token = newInstallToken(this.random);
    const redemption = await this.credentials.redeemPairCode(checked.pairCodeId, {
      id: newRowId(this.random),
      tokenSha256: sha256Hex(token),
      createdAt: now,
    });
    if (redemption !== 'redeemed') {
      this.logger.warn({ event: 'install.pair-refused', outcome: redemption, correlationId });
      throw new InstallUnauthorizedError();
    }
    this.logger.log({ event: 'install.paired', correlationId });
    return { token };
  }

  private async check(body: unknown, now: Date): Promise<CodeCheck> {
    const pending = await this.credentials.pendingPairCode();
    if (pending === null) return { outcome: 'invalid' };
    if (pending.expiresAt.getTime() <= now.getTime()) {
      await this.credentials.deletePairCode(pending.id);
      return { outcome: 'invalid' };
    }
    const parsed = InstallPairRequestSchema.safeParse(body);
    // A malformed code is still compared (against a digest that cannot match) so both paths cost the same.
    const candidate = sha256Hex(parsed.success ? parsed.data.code : '');
    if (parsed.success && matchesAnyDigest(candidate, [pending.codeSha256])) return { outcome: 'valid', pairCodeId: pending.id };
    await this.credentials.recordFailedAttempt(pending.id, PAIR_CODE_MAX_FAILED_ATTEMPTS);
    return { outcome: 'invalid' };
  }
}
