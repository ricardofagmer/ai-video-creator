import { Injectable } from '@nestjs/common';
import { verify } from '@node-rs/argon2';
import { PrismaService } from '@studio/core/prisma';
import { ARGON2ID_PHC_PATTERN, PASSPHRASE_HASH_SETTING_KEY } from '@studio/shared/api';
import { PassphraseHashInvalidError, PassphraseNotConfiguredError } from '../platform/api.errors';

/**
 * Data access only: reads the one settings row (C8, A13) named by the shared
 * `PASSPHRASE_HASH_SETTING_KEY`; never writes. Its writer is the CLI (`studio passphrase set`).
 */
@Injectable()
export class PassphraseHashRepository {
  constructor(private readonly prisma: PrismaService) {}

  async find(): Promise<string | null> {
    const row = await this.prisma.setting.findUnique({ where: { key: PASSPHRASE_HASH_SETTING_KEY }, select: { value: true } });
    return row === null ? null : row.value;
  }
}

/**
 * Checks a passphrase against its stored argon2id hash with a maintained library (A13, ADR 0001;
 * never hand-rolled). The library's verification compares in constant time. Anything but an
 * argon2id hash fails closed, so a tampered row cannot downgrade the scheme.
 */
@Injectable()
export class PassphraseVerifier {
  constructor(private readonly hashes: PassphraseHashRepository) {}

  async verify(passphrase: string): Promise<boolean> {
    const encoded = await this.hashes.find();
    if (encoded === null) throw new PassphraseNotConfiguredError();
    if (!ARGON2ID_PHC_PATTERN.test(encoded)) throw new PassphraseHashInvalidError();
    return verify(encoded, passphrase);
  }
}
