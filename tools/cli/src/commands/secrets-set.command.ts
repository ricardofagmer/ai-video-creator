import { KeychainWriter, SECRET_ENVIRONMENT_VARIABLES, SECRET_NAMES, isSecretName } from '@studio/core/secrets';
import { CliUsageError } from '../errors/cli.errors.js';
import { ExitCode } from '../errors/exit-codes.js';
import { type CommandDependencies } from './command-dependencies.js';

/**
 * `studio secrets set <name>` (PRD 11, D3): stores a provider key in the macOS Keychain through
 * core `KeychainWriter.promptAndStore`. `/usr/bin/security` prompts for the value on the inherited
 * terminal, so this process never receives, holds, prints or logs it, and it never reaches argv.
 * `KeychainWriter` has no dependencies, so no Nest context (and no database) is needed here.
 */
export async function secretsSetCommand(name: string, dependencies: CommandDependencies): Promise<number> {
  if (!isSecretName(name)) throw new CliUsageError(`Nome de chave desconhecido. Use um de: ${SECRET_NAMES.join(', ')}.`);
  const { printer, settings } = dependencies;
  printer.line(`Guardando ${name} no Keychain. Digite o valor quando o macOS pedir; nada aparece na tela.`);
  await new KeychainWriter().promptAndStore(name);
  printer.line(`${name} guardada no Keychain.`);
  const variable = SECRET_ENVIRONMENT_VARIABLES[name];
  if (settings.keyVariablesSet.includes(variable)) {
    printer.error(`Aviso: ${variable} está definida no ambiente e tem prioridade sobre o Keychain.`);
  }
  return ExitCode.ok;
}
