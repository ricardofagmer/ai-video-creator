import { ExitCode } from '../errors/exit-codes.js';
import { cliText } from '../i18n/messages.js';
import { withCliContext } from '../nest/cli-context.js';
import { type CommandDependencies } from './command-dependencies.js';

/**
 * `studio passphrase status`: exit 0 when the passphrase hash row exists, 3 (not found) when it
 * does not. scripts/install.sh (R1-22) branches on the code so a rerun does not ask again.
 */
export async function passphraseStatusCommand(dependencies: CommandDependencies): Promise<number> {
  const { printer } = dependencies;
  return withCliContext(async (context) => {
    if (await context.passphraseHashes.exists()) {
      printer.line(cliText().commands.passphrase.isSet);
      return ExitCode.ok;
    }
    printer.line(cliText().commands.passphrase.notSet);
    return ExitCode.notFound;
  });
}
