import { createHash, timingSafeEqual } from 'node:crypto';
import { InstallTokenSchema, PAIR_CODE_ALPHABET, PAIR_CODE_LENGTH, type InstallToken, type PairCode } from '@studio/shared/api';
import { type InstallRandomSource } from './install-runtime';

/** 256-bit portal tokens (ADR 0010 decision 7): 32 bytes, base64url, 43 characters. */
const TOKEN_BYTES = 32;
/** Row ids carry no meaning and are never part of a code or token. */
const ROW_ID_BYTES = 16;

/**
 * Bytes at or above this value are discarded so every alphabet character is equally likely: 256
 * is not a multiple of the alphabet size, and `byte % size` would favour the first characters.
 */
const UNBIASED_BYTE_LIMIT = 256 - (256 % PAIR_CODE_ALPHABET.length);

export class InstallSecretFormatError extends Error {
  readonly category = 'internal';

  constructor() {
    super('The random source produced a value that does not match the install contract');
    this.name = 'InstallSecretFormatError';
  }
}

/** SHA-256 as lowercase hex: the only form in which a code or token is stored. */
export function sha256Hex(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function newRowId(random: InstallRandomSource): string {
  return random.bytes(ROW_ID_BYTES).toString('base64url');
}

export function newInstallToken(random: InstallRandomSource): InstallToken {
  const parsed = InstallTokenSchema.safeParse(random.bytes(TOKEN_BYTES).toString('base64url'));
  if (!parsed.success) throw new InstallSecretFormatError();
  return parsed.data;
}

export function newPairCode(random: InstallRandomSource): PairCode {
  let code = '';
  while (code.length < PAIR_CODE_LENGTH) {
    for (const byte of random.bytes(PAIR_CODE_LENGTH * 2)) {
      if (byte >= UNBIASED_BYTE_LIMIT) continue;
      code += PAIR_CODE_ALPHABET.charAt(byte % PAIR_CODE_ALPHABET.length);
      if (code.length === PAIR_CODE_LENGTH) break;
    }
  }
  return code;
}

/**
 * True when `candidateHex` equals one of `storedHexes`. Every stored digest is compared, with
 * `timingSafeEqual`, whatever matched earlier, so the time taken says nothing about which one or
 * how many bytes matched.
 */
export function matchesAnyDigest(candidateHex: string, storedHexes: readonly string[]): boolean {
  const candidate = Buffer.from(candidateHex, 'hex');
  let matched = false;
  for (const storedHex of storedHexes) {
    const stored = Buffer.from(storedHex, 'hex');
    const equal = stored.length === candidate.length && timingSafeEqual(stored, candidate);
    matched = matched || equal;
  }
  return matched;
}
