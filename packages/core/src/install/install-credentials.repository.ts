import { Injectable } from '@nestjs/common';
import { MAX_LIVE_INSTALL_TOKENS } from '@studio/shared/api';
import { PrismaService } from '../prisma/prisma.service';

/** The pending pair code row, digest only. */
export interface PendingPairCode {
  id: string;
  codeSha256: string;
  expiresAt: Date;
  failedAttempts: number;
}

export interface NewPairCode {
  id: string;
  codeSha256: string;
  issuedAt: Date;
  expiresAt: Date;
}

export interface NewInstallToken {
  id: string;
  tokenSha256: string;
  createdAt: Date;
}

/** What redeeming the pending code did; decided inside one transaction. */
export type PairCodeRedemption = 'redeemed' | 'already-used';

/**
 * Data access for portal pairing (tables `install_pair_codes` and `install_tokens`). Holds digests
 * only; never receives or returns a code or a token in clear.
 */
@Injectable()
export class InstallCredentialsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async pendingPairCode(): Promise<PendingPairCode | null> {
    return this.prisma.installPairCode.findFirst({
      orderBy: { issuedAt: 'desc' },
      select: { id: true, codeSha256: true, expiresAt: true, failedAttempts: true },
    });
  }

  /** One pending code at a time: a new code replaces any earlier one. */
  async replacePairCode(code: NewPairCode): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.installPairCode.deleteMany({});
      await transaction.installPairCode.create({ data: { ...code, failedAttempts: 0 } });
    });
  }

  async deletePairCode(id: string): Promise<void> {
    await this.prisma.installPairCode.deleteMany({ where: { id } });
  }

  /** Counts one failed attempt; the code is deleted when the count reaches `maxFailedAttempts`. */
  async recordFailedAttempt(id: string, maxFailedAttempts: number): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.installPairCode.updateMany({ where: { id }, data: { failedAttempts: { increment: 1 } } });
      if (updated.count === 0) return;
      await transaction.installPairCode.deleteMany({ where: { id, failedAttempts: { gte: maxFailedAttempts } } });
    });
  }

  /**
   * Consumes the code and stores the token in one transaction, so two concurrent requests with
   * the same code cannot both get a token. Past `MAX_LIVE_INSTALL_TOKENS`, the oldest are dropped.
   */
  async redeemPairCode(pairCodeId: string, token: NewInstallToken): Promise<PairCodeRedemption> {
    return this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.installPairCode.deleteMany({ where: { id: pairCodeId } });
      if (consumed.count !== 1) return 'already-used';
      await transaction.installToken.create({ data: token });
      const surplus = await transaction.installToken.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: MAX_LIVE_INSTALL_TOKENS,
        select: { id: true },
      });
      if (surplus.length > 0) await transaction.installToken.deleteMany({ where: { id: { in: surplus.map((row) => row.id) } } });
      return 'redeemed';
    });
  }

  /** Every live token digest; at most `MAX_LIVE_INSTALL_TOKENS` rows by construction. */
  async tokenDigests(): Promise<string[]> {
    const rows = await this.prisma.installToken.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: { tokenSha256: true },
      take: MAX_LIVE_INSTALL_TOKENS,
    });
    return rows.map((row) => row.tokenSha256);
  }

  async hasAnyToken(): Promise<boolean> {
    return (await this.prisma.installToken.count()) > 0;
  }

  /** "Revoke all" from the shell; the pending code goes too, so no pairing is left half-open. */
  async revokeAll(): Promise<number> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.installPairCode.deleteMany({});
      const removed = await transaction.installToken.deleteMany({});
      return removed.count;
    });
  }
}
