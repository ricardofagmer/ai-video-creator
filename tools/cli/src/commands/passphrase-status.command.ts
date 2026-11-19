import { ExitCode } from '../errors/exit-codes.js';
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
      printer.line('Senha do studio: definida.');
      return ExitCode.ok;
    }
    printer.line('Senha do studio: não definida. Use "studio passphrase set".');
    return ExitCode.notFound;
  });
}
