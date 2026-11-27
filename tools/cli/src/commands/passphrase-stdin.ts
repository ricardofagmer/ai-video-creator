import { CliError } from '../errors/cli.errors.js';
import { cliText } from '../i18n/messages.js';
import { MAX_PASSPHRASE_LENGTH } from '../passphrase/passphrase-hasher.js';

/** What `--stdin` reads from; `process.stdin` in production, a stub in tests. */
export interface PassphraseInput extends AsyncIterable<unknown> {
  readonly isTTY?: boolean;
}

export type PassphraseInputProblem = 'terminal' | 'line-count' | 'too-large' | 'not-utf8';

/** Messages name the problem only; nothing read from stdin is ever part of one. */
export class PassphraseInputError extends CliError {
  override readonly category = 'validation';

  constructor(readonly problem: PassphraseInputProblem) {
    super(cliText().errors.passphraseStdin[problem]);
    this.name = 'PassphraseInputError';
  }
}

/** Two lines of at most `MAX_PASSPHRASE_LENGTH` code points (4 UTF-8 bytes each) plus CRLF endings. */
const MAX_INPUT_BYTES = 2 * (MAX_PASSPHRASE_LENGTH * 4 + 2);

export interface PassphrasePair {
  readonly first: string;
  readonly second: string;
}

function toBuffer(chunk: unknown): Buffer {
  if (Buffer.isBuffer(chunk)) return chunk;
  if (typeof chunk === 'string') return Buffer.from(chunk, 'utf8');
  if (chunk instanceof Uint8Array) return Buffer.from(chunk);
  throw new PassphraseInputError('not-utf8');
}

function wipe(chunks: readonly Buffer[]): void {
  for (const chunk of chunks) chunk.fill(0);
}

async function readBounded(input: PassphraseInput): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of input) {
      const bytes = toBuffer(chunk);
      chunks.push(bytes);
      total += bytes.length;
      if (total > MAX_INPUT_BYTES) throw new PassphraseInputError('too-large');
    }
    return Buffer.concat(chunks);
  } finally {
    // The joined copy is the caller's to wipe; the read chunks are wiped here.
    wipe(chunks);
  }
}

function decodeStrict(bytes: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new PassphraseInputError('not-utf8');
  }
}

/**
 * `studio passphrase set --stdin`: exactly two lines, the passphrase and its repetition, from a
 * pipe (the first-run setup window of the packaged app). A terminal is refused so nobody types a
 * passphrase with echo on. The value is never echoed, logged or put in an error; the read bytes
 * are zeroed once decoded (the decoded strings cannot be, a JavaScript limit).
 */
export async function readPassphrasePair(input: PassphraseInput): Promise<PassphrasePair> {
  if (input.isTTY === true) throw new PassphraseInputError('terminal');
  const bytes = await readBounded(input);
  let text: string;
  try {
    text = decodeStrict(bytes);
  } finally {
    bytes.fill(0);
  }
  const lines = text.split('\n');
  // One trailing newline ends the second line; it does not start a third.
  if (lines.length === 3 && lines[2] === '') lines.pop();
  const [first, second] = lines.map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
  if (lines.length !== 2 || first === undefined || second === undefined) throw new PassphraseInputError('line-count');
  return { first, second };
}
