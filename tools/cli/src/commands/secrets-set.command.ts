import {
  ALL_SECRET_NAMES,
  KeychainWriter,
  SECRET_ENVIRONMENT_VARIABLES,
  isPlatformClientSecretName,
  isSecretName,
  secretValuePattern,
  type SecretName,
} from '@studio/core/secrets';
import { CliUsageError } from '../errors/cli.errors.js';
import { ExitCode } from '../errors/exit-codes.js';
import { type CommandDependencies } from './command-dependencies.js';

/**
 * The length rule of `name`'s value, read from `secretValuePattern(name)` itself so the text cannot
 * drift from the rule core enforces when it loads the value (`MalformedSecretError`).
 */
function secretValueRuleText(name: SecretName): string {
  const bounds = /\{(\d+),(\d+)\}/u.exec(secretValuePattern(name).source);
  const length = bounds === null ? '' : ` de ${bounds[1]} a ${bounds[2]} caracteres`;
  return `O valor precisa ter${length}, só caracteres ASCII visíveis, sem espaços.`;
}

/**
 * `studio secrets set <name>` (PRD 11, D3; SPEC 0007 section 5.2): stores a provider key or one of
 * the six platform app credentials in the macOS Keychain through core
 * `KeychainWriter.promptAndStore`. `/usr/bin/security` prompts for the value on the inherited
 * terminal, so this process never receives, holds, prints or logs it, and it never reaches argv.
 * The shape rule of each name (`secretValuePattern(name)`) is printed before the prompt and enforced
 * by core whenever the value is loaded. `KeychainWriter` has no dependencies, so no Nest context
 * (and no database) is needed here.
 */
export async function secretsSetCommand(name: string, dependencies: CommandDependencies): Promise<number> {
  if (!isSecretName(name)) throw new CliUsageError(`Nome de chave desconhecido. Use um de: ${ALL_SECRET_NAMES.join(', ')}.`);
  const { printer, settings } = dependencies;
  const kind = isPlatformClientSecretName(name) ? 'credencial do aplicativo' : 'chave';
  printer.line(`Guardando a ${kind} ${name} no Keychain. ${secretValueRuleText(name)}`);
  printer.line('Digite o valor quando o macOS pedir; nada aparece na tela.');
  await new KeychainWriter().promptAndStore(name);
  printer.line(`${name} guardada no Keychain.`);
  const variable = SECRET_ENVIRONMENT_VARIABLES[name];
  if (settings.keyVariablesSet.includes(variable)) {
    printer.error(`Aviso: ${variable} está definida no ambiente e tem prioridade sobre o Keychain.`);
  }
  return ExitCode.ok;
}
