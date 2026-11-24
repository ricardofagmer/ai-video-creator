import { hash } from '@node-rs/argon2';
import { ARGON2ID_PHC_PATTERN } from '@studio/shared/api';
import { CliError } from '../errors/cli.errors.js';
import { cliText } from '../i18n/messages.js';

/** Lowered from 12 on the owner's request (2026-11-22): a loopback-only, single-owner studio. */
export const MIN_PASSPHRASE_LENGTH = 8;
/** Bounds the hashing input; a longer value is refused, not cut. */
export const MAX_PASSPHRASE_LENGTH = 1024;

/** OWASP argon2id minimum (19 MiB, 2 passes, 1 lane); the library's default algorithm is argon2id. */
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export type PassphraseProblem = 'too-short' | 'too-long' | 'mismatch' | 'unexpected-hash-format';

function problemMessage(problem: PassphraseProblem): string {
  const message: (bound: number) => string = cliText().errors.passphrase[problem];
  return message(problem === 'too-long' ? MAX_PASSPHRASE_LENGTH : MIN_PASSPHRASE_LENGTH);
}

/** Messages never contain the passphrase or its hash. */
export class PassphraseRefusedError extends CliError {
  override readonly category: 'validation' | 'internal';

  constructor(readonly problem: PassphraseProblem) {
    super(problemMessage(problem));
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
