import { ExitCode } from '../errors/exit-codes.js';
import { cliText } from '../i18n/messages.js';
import { withCliContext } from '../nest/cli-context.js';
import { MAX_PASSPHRASE_LENGTH, MIN_PASSPHRASE_LENGTH, assertAcceptablePassphrase, hashPassphrase } from '../passphrase/passphrase-hasher.js';
import { readHiddenLine } from '../terminal/hidden-prompt.js';
import { type CommandDependencies } from './command-dependencies.js';
import { readPassphrasePair, type PassphraseInput, type PassphrasePair } from './passphrase-stdin.js';

const COMMAND = 'passphrase set';

/** Where the two entries come from: the terminal (echo off) or, with `--stdin`, a pipe. */
export type PassphraseSource = { kind: 'terminal' } | { kind: 'stdin'; input: PassphraseInput };

export interface PassphraseSetOptions {
  stdin: boolean;
}

/** Commander's option bag at the boundary; anything but `stdin: true` means the terminal path. */
export function parsePassphraseSetOptions(options: unknown): PassphraseSetOptions {
  const stdin = typeof options === 'object' && options !== null && 'stdin' in options ? options.stdin : undefined;
  return { stdin: stdin === true };
}

async function readFromTerminal(): Promise<PassphrasePair> {
  const text = cliText().commands.passphrase;
  const prompt = { maxLength: MAX_PASSPHRASE_LENGTH, command: COMMAND };
  const first = await readHiddenLine({ ...prompt, label: text.first(MIN_PASSPHRASE_LENGTH) });
  const second = await readHiddenLine({ ...prompt, label: text.repeat });
  return { first, second };
}

/**
 * `studio passphrase set` (D8, A13; called by scripts/install.sh R1-22 and rerunnable): reads the
 * local web passphrase twice with echo off, hashes it with argon2id and upserts only the PHC string
 * into the `settings` row the api verifies. With `--stdin` (the packaged app's first-run setup,
 * plan section 5 step 4) the two entries are two lines from a pipe instead; a terminal is refused.
 * Either way the passphrase is never on argv, echoed, logged or stored; a rerun replaces the hash.
 * Empty or differing entries are a `PassphraseRefusedError` (exit 2) and nothing is written.
 */
export async function passphraseSetCommand(dependencies: CommandDependencies, source: PassphraseSource = { kind: 'terminal' }): Promise<number> {
  const { printer } = dependencies;
  // The database is opened first, so a missing migration fails before the owner types anything.
  return withCliContext(async (context) => {
    const { first, second } = source.kind === 'stdin' ? await readPassphrasePair(source.input) : await readFromTerminal();
    assertAcceptablePassphrase(first, second);
    await context.passphraseHashes.save(await hashPassphrase(first));
    printer.line(cliText().commands.passphrase.saved);
    return ExitCode.ok;
  });
}
