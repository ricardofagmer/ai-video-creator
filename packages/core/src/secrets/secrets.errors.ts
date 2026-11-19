import { type SecretSource } from './secret';
import { type SecretName } from './secret-names';

/** Error taxonomy category (rules/observability.md). */
export type SecretsErrorCategory = 'validation' | 'dependency' | 'internal';

/**
 * Base of every secrets error. Messages carry the secret NAME and the source only; no value,
 * no command output and no underlying error object is ever attached (`cause` is never set),
 * because a child-process error carries its stdout, which can hold the key.
 */
export abstract class SecretsError extends Error {
  abstract readonly category: SecretsErrorCategory;
}

/** A value was found but does not look like a key; refused rather than used or matched. */
export class MalformedSecretError extends SecretsError {
  override readonly category = 'validation';

  constructor(
    readonly secretName: SecretName,
    readonly source: SecretSource,
  ) {
    super(`The ${secretName} found in the ${source} is malformed; set it again`);
    this.name = 'MalformedSecretError';
  }
}

export type KeychainFailureReason = 'unsupported-platform' | 'timeout' | 'command-failed' | 'output-too-large';

/** The Keychain could not be read or written; the reason is a fixed enum, never tool output. */
export class KeychainUnavailableError extends SecretsError {
  override readonly category = 'dependency';

  constructor(
    readonly secretName: SecretName,
    readonly reason: KeychainFailureReason,
    readonly exitCode: number | null,
  ) {
    super(`The macOS Keychain could not be used for ${secretName} (${reason}${exitCode === null ? '' : `, exit ${exitCode}`})`);
    this.name = 'KeychainUnavailableError';
  }
}

/** `studio secrets set` needs a terminal: `security` prompts for the value itself. */
export class KeychainWriteNeedsTerminalError extends SecretsError {
  override readonly category = 'validation';

  constructor(readonly secretName: SecretName) {
    super(`Storing ${secretName} needs an interactive terminal; run the command in Terminal`);
    this.name = 'KeychainWriteNeedsTerminalError';
  }
}
