import { Injectable } from '@nestjs/common';
import { PrismaService } from '@studio/core/prisma';
import { PASSPHRASE_HASH_SETTING_KEY } from '@studio/shared/api';

/**
 * Writes the passphrase hash row, keyed by the shared `PASSPHRASE_HASH_SETTING_KEY` (C10, A13), the
 * same key the api reads. Core has no settings module or command for this row (R1-16 keeps
 * the reader in the api), so this small CLI-local repository is the one writer, through core
 * `PrismaService`; it stays data access only and receives a PHC string, never the passphrase.
 */
@Injectable()
export class PassphraseHashRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** True when a hash row exists; never reads or returns the hash itself. */
  async exists(): Promise<boolean> {
    const count = await this.prisma.setting.count({ where: { key: PASSPHRASE_HASH_SETTING_KEY } });
    return count > 0;
  }

  /** Idempotent: a rerun replaces the stored hash. */
  async save(phcHash: string): Promise<void> {
    await this.prisma.setting.upsert({
      where: { key: PASSPHRASE_HASH_SETTING_KEY },
      create: { key: PASSPHRASE_HASH_SETTING_KEY, value: phcHash },
      update: { value: phcHash },
    });
  }
}
