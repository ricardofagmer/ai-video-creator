import { Inject, Injectable, Logger } from '@nestjs/common';
import { PAIR_CODE_TTL_MS, type PairCode } from '@studio/shared/api';
import { InstallCredentialsRepository } from './install-credentials.repository';
import { newPairCode, newRowId, sha256Hex } from './install-secrets';
import { INSTALL_CLOCK, INSTALL_RANDOM_SOURCE, type InstallClock, type InstallRandomSource } from './install-runtime';

export interface IssuedPairCode {
  /** Shown once to the owner (the shell puts it in the portal URL fragment); never stored. */
  code: PairCode;
  expiresAt: Date;
}

export interface RevokedInstallTokens {
  revoked: number;
}

/**
 * The shell-side operations of portal pairing (ADR 0010 decision 7), called through the CLI
 * (ticket 07): issue a one-time code, and revoke every portal token. Depends only on core's
 * Prisma client and the injected clock and random source, so a CLI Nest context can provide it.
 * Logs carry outcomes and counts only, never a code or a token.
 */
@Injectable()
export class InstallPairingUseCase {
  private readonly logger = new Logger(InstallPairingUseCase.name);

  constructor(
    private readonly credentials: InstallCredentialsRepository,
    @Inject(INSTALL_CLOCK) private readonly clock: InstallClock,
    @Inject(INSTALL_RANDOM_SOURCE) private readonly random: InstallRandomSource,
  ) {}

  async issuePairCode(): Promise<IssuedPairCode> {
    const issuedAt = this.clock.now();
    const expiresAt = new Date(issuedAt.getTime() + PAIR_CODE_TTL_MS);
    const code = newPairCode(this.random);
    await this.credentials.replacePairCode({ id: newRowId(this.random), codeSha256: sha256Hex(code), issuedAt, expiresAt });
    this.logger.log({ event: 'install.pair-code-issued' });
    return { code, expiresAt };
  }

  async revokeAllTokens(): Promise<RevokedInstallTokens> {
    const revoked = await this.credentials.revokeAll();
    this.logger.log({ event: 'install.tokens-revoked', revoked });
    return { revoked };
  }
}
