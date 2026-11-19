import { ExitCode } from '../errors/exit-codes.js';
import { withCliContext } from '../nest/cli-context.js';
import { MAX_PASSPHRASE_LENGTH, assertAcceptablePassphrase, hashPassphrase } from '../passphrase/passphrase-hasher.js';
import { readHiddenLine } from '../terminal/hidden-prompt.js';
import { type CommandDependencies } from './command-dependencies.js';

const COMMAND = 'passphrase set';

/**
 * `studio passphrase set` (D8, A13; called by scripts/install.sh R1-22 and rerunnable): reads the
 * local web passphrase twice with echo off, hashes it with argon2id and upserts only the PHC string
 * into the `settings` row the api verifies. The passphrase is never on argv, echoed, logged or
 * stored; a rerun replaces the hash.
 */
export async function passphraseSetCommand(dependencies: CommandDependencies): Promise<number> {
  const { printer } = dependencies;
  // The database is opened first, so a missing migration fails before the owner types anything.
  return withCliContext(async (context) => {
    const prompt = { maxLength: MAX_PASSPHRASE_LENGTH, command: COMMAND };
    const first = await readHiddenLine({ ...prompt, label: 'Senha do studio (mínimo 12 caracteres, nada aparece): ' });
    const second = await readHiddenLine({ ...prompt, label: 'Repita a senha: ' });
    assertAcceptablePassphrase(first, second);
    await context.passphraseHashes.save(await hashPassphrase(first));
    printer.line('Senha do studio gravada (somente o hash argon2id).');
    return ExitCode.ok;
  });
}
