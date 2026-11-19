import { hash } from '@node-rs/argon2';
import { ARGON2ID_PHC_PATTERN } from '@studio/shared/api';
import { CliError } from '../errors/cli.errors.js';

export const MIN_PASSPHRASE_LENGTH = 12;
/** Bounds the hashing input; a longer value is refused, not cut. */
export const MAX_PASSPHRASE_LENGTH = 1024;

/** OWASP argon2id minimum (19 MiB, 2 passes, 1 lane); the library's default algorithm is argon2id. */
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export type PassphraseProblem = 'too-short' | 'too-long' | 'mismatch' | 'unexpected-hash-format';

const problemMessages: Readonly<Record<PassphraseProblem, string>> = {
  'too-short': `A senha precisa de pelo menos ${MIN_PASSPHRASE_LENGTH} caracteres.`,
  'too-long': `A senha passa de ${MAX_PASSPHRASE_LENGTH} caracteres.`,
  mismatch: 'As duas senhas digitadas não conferem; nada foi gravado.',
  'unexpected-hash-format': 'O hash gerado não está no formato argon2id esperado pela api; nada foi gravado.',
};

/** Messages never contain the passphrase or its hash. */
export class PassphraseRefusedError extends CliError {
  override readonly category: 'validation' | 'internal';

  constructor(readonly problem: PassphraseProblem) {
    super(problemMessages[problem]);
    this.name = 'PassphraseRefusedError';
    this.category = problem === 'unexpected-hash-format' ? 'internal' : 'validation';
  }
}

/** Characters as the owner typed them (code points), not UTF-16 units. */
function characterCount(text: string): number {
  return [...text].length;
}

export function assertAcceptablePassphrase(first: string, second: string): void {
  const length = characterCount(first);
  if (length < MIN_PASSPHRASE_LENGTH) throw new PassphraseRefusedError('too-short');
  if (length > MAX_PASSPHRASE_LENGTH) throw new PassphraseRefusedError('too-long');
  if (first !== second) throw new PassphraseRefusedError('mismatch');
}

/**
 * argon2id through the maintained library the api verifies with (A13; never hand-rolled). The result
 * is checked against the shared `ARGON2ID_PHC_PATTERN`, the only shape the api accepts, so a hash the
 * api would refuse is never stored (fails closed).
 */
export async function hashPassphrase(passphrase: string): Promise<string> {
  const encoded = await hash(passphrase, ARGON2_OPTIONS);
  if (!ARGON2ID_PHC_PATTERN.test(encoded)) throw new PassphraseRefusedError('unexpected-hash-format');
  return encoded;
}
