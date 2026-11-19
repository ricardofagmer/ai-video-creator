/**
 * Provider keys the studio reads (PRD 12, ADR 0002 "Key handling"). Each one is looked up in the
 * environment first, then in the macOS Keychain entry that `studio secrets set <name>` writes
 * (R1-21). These are names, never values.
 */
export const SECRET_NAMES = ['anthropic-api-key', 'elevenlabs-api-key'] as const;
export type SecretName = (typeof SECRET_NAMES)[number];

export function isSecretName(value: string): value is SecretName {
  return SECRET_NAMES.some((name) => name === value);
}

/** Environment variable that overrides the Keychain (PRD 11 "environment variables override"). */
export const SECRET_ENVIRONMENT_VARIABLES: Readonly<Record<SecretName, string>> = {
  'anthropic-api-key': 'ANTHROPIC_API_KEY',
  'elevenlabs-api-key': 'ELEVENLABS_API_KEY',
};

/**
 * Keychain generic-password item: one shared service, one account per secret name. R1-21 writes
 * with the same constants through `KeychainWriter`, so reader and writer cannot drift.
 */
export const KEYCHAIN_SERVICE = 'com.videostudio.provider-keys';

export const KEYCHAIN_ACCOUNTS: Readonly<Record<SecretName, string>> = {
  'anthropic-api-key': 'anthropic-api-key',
  'elevenlabs-api-key': 'elevenlabs-api-key',
};

/** Keychain item label shown in Keychain Access; descriptive text only. */
export const KEYCHAIN_LABELS: Readonly<Record<SecretName, string>> = {
  'anthropic-api-key': 'Video Studio - Anthropic API key',
  'elevenlabs-api-key': 'Video Studio - ElevenLabs API key',
};

/**
 * Shape bounds for a loaded key: printable ASCII without spaces. A value outside them is refused
 * (named error, no value) instead of being sent to a provider or matched by the redactor.
 */
export const SECRET_VALUE_PATTERN = /^[\x21-\x7e]{16,512}$/;
