import {
  ALL_SECRET_NAMES,
  KeychainWriter,
  SECRET_ENVIRONMENT_VARIABLES,
  assertStoredSecretWellFormed,
  isPlatformClientSecretName,
  isSecretName,
  secretValuePattern,
  type SecretName,
} from '@studio/core/secrets';
import { CliUsageError } from '../errors/cli.errors.js';
import { ExitCode } from '../errors/exit-codes.js';
import { cliText } from '../i18n/messages.js';
import { type CommandDependencies } from './command-dependencies.js';

/**
 * The length rule of `name`'s value, read from `secretValuePattern(name)` itself so the text cannot
 * drift from the rule core enforces when it loads the value (`MalformedSecretError`).
 */
function secretValueRuleText(name: SecretName): string {
  const bounds = /\{(\d+),(\d+)\}/u.exec(secretValuePattern(name).source);
  return cliText().commands.secrets.valueRule(bounds === null ? null : { min: bounds[1] ?? '', max: bounds[2] ?? '' });
}

/**
 * `studio secrets set <name>` (PRD 11, D3; SPEC 0007 section 5.2): stores a provider key or one of
 * the six platform app credentials in the macOS Keychain through core
 * `KeychainWriter.promptAndStore`. `/usr/bin/security` prompts for the value on the inherited
 * terminal, so this process never receives, holds, prints or logs it, and it never reaches argv.
 * The shape rule of each name (`secretValuePattern(name)`) is printed before the prompt, checked on
 * the stored item right after the prompt (`assertStoredSecretWellFormed`: a bad value is a
 * `MalformedSecretError`, exit 2, instead of a later api/watcher boot failure) and enforced by core
 * whenever the value is loaded. `KeychainWriter` has no dependencies, so no Nest context (and no
 * database) is needed here.
 */
export async function secretsSetCommand(name: string, dependencies: CommandDependencies): Promise<number> {
  if (!isSecretName(name)) throw new CliUsageError(cliText().usage.unknownSecretName(ALL_SECRET_NAMES.join(', ')));
  const { printer, settings } = dependencies;
  const text = cliText().commands.secrets;
  const kind = isPlatformClientSecretName(name) ? text.appCredential : text.key;
  printer.line(text.storing(kind, name, secretValueRuleText(name)));
  printer.line(text.typeWhenAsked);
  await new KeychainWriter().promptAndStore(name);
  await assertStoredSecretWellFormed(name);
  printer.line(text.stored(name));
  const variable = SECRET_ENVIRONMENT_VARIABLES[name];
  if (settings.keyVariablesSet.includes(variable)) printer.error(text.envOverrides(variable));
  return ExitCode.ok;
}
