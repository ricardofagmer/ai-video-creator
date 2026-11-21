/**
 * Provider keys the studio reads (PRD 12, ADR 0002 "Key handling"). Each one is looked up in the
 * environment first, then in the macOS Keychain entry that `studio secrets set <name>` writes
 * (R1-21). These are names, never values. `SECRET_NAMES` stays the two provider keys: the seed
 * manifest's `credential` enum is built from it.
 */
export const SECRET_NAMES = ['anthropic-api-key', 'elevenlabs-api-key'] as const;
export type ProviderSecretName = (typeof SECRET_NAMES)[number];

/**
 * The six OAuth client credentials of the connected platforms (SPEC 0007 section 5.2). Resolved
 * the same way as the provider keys: environment first, then the same Keychain service, written by
 * `studio secrets set <name>`. Never a literal, never a default: a missing one gives the platform
 * the status `not-configured` in live mode.
 */
export const PLATFORM_CLIENT_SECRET_NAMES = [
  'youtube-oauth-client-id',
  'youtube-oauth-client-secret',
  'instagram-app-id',
  'instagram-app-secret',
  'tiktok-client-key',
  'tiktok-client-secret',
] as const;
export type PlatformClientSecretName = (typeof PLATFORM_CLIENT_SECRET_NAMES)[number];

/** Every name the studio resolves and `studio secrets set` accepts. */
export const ALL_SECRET_NAMES = [...SECRET_NAMES, ...PLATFORM_CLIENT_SECRET_NAMES] as const;
export type SecretName = ProviderSecretName | PlatformClientSecretName;

export function isSecretName(value: string): value is SecretName {
  return ALL_SECRET_NAMES.some((name) => name === value);
}

export function isPlatformClientSecretName(name: SecretName): name is PlatformClientSecretName {
  return PLATFORM_CLIENT_SECRET_NAMES.some((candidate) => candidate === name);
}

/** Environment variable that overrides the Keychain (PRD 11 "environment variables override"). */
export const SECRET_ENVIRONMENT_VARIABLES: Readonly<Record<SecretName, string>> = {
  'anthropic-api-key': 'ANTHROPIC_API_KEY',
  'elevenlabs-api-key': 'ELEVENLABS_API_KEY',
  'youtube-oauth-client-id': 'YOUTUBE_OAUTH_CLIENT_ID',
  'youtube-oauth-client-secret': 'YOUTUBE_OAUTH_CLIENT_SECRET',
  'instagram-app-id': 'INSTAGRAM_APP_ID',
  'instagram-app-secret': 'INSTAGRAM_APP_SECRET',
  'tiktok-client-key': 'TIKTOK_CLIENT_KEY',
  'tiktok-client-secret': 'TIKTOK_CLIENT_SECRET',
};

/**
 * Keychain generic-password item: one shared service, one account per secret name. R1-21 writes
 * with the same constants through `KeychainWriter`, so reader and writer cannot drift.
 */
export const KEYCHAIN_SERVICE = 'com.videostudio.provider-keys';

export const KEYCHAIN_ACCOUNTS: Readonly<Record<SecretName, string>> = {
  'anthropic-api-key': 'anthropic-api-key',
  'elevenlabs-api-key': 'elevenlabs-api-key',
  'youtube-oauth-client-id': 'youtube-oauth-client-id',
  'youtube-oauth-client-secret': 'youtube-oauth-client-secret',
  'instagram-app-id': 'instagram-app-id',
  'instagram-app-secret': 'instagram-app-secret',
  'tiktok-client-key': 'tiktok-client-key',
  'tiktok-client-secret': 'tiktok-client-secret',
};

/** Keychain item label shown in Keychain Access; descriptive text only. */
export const KEYCHAIN_LABELS: Readonly<Record<SecretName, string>> = {
  'anthropic-api-key': 'Video Studio - Anthropic API key',
  'elevenlabs-api-key': 'Video Studio - ElevenLabs API key',
  'youtube-oauth-client-id': 'Video Studio - YouTube OAuth client id',
  'youtube-oauth-client-secret': 'Video Studio - YouTube OAuth client secret',
  'instagram-app-id': 'Video Studio - Instagram app id',
  'instagram-app-secret': 'Video Studio - Instagram app secret',
  'tiktok-client-key': 'Video Studio - TikTok client key',
  'tiktok-client-secret': 'Video Studio - TikTok client secret',
};

/**
 * Shape bounds for a loaded provider key: printable ASCII without spaces. A value outside them is
 * refused (named error, no value) instead of being sent to a provider or matched by the redactor.
 */
export const SECRET_VALUE_PATTERN = /^[\x21-\x7e]{16,512}$/;

/**
 * Shape bounds for an OAuth client credential. Shorter than a provider key is allowed because an
 * Instagram app id is a 15 or 16 digit number; still printable ASCII without spaces.
 */
export const PLATFORM_CLIENT_SECRET_VALUE_PATTERN = /^[\x21-\x7e]{8,512}$/;

/** The pattern a value of `name` must match; the provider keys keep `SECRET_VALUE_PATTERN`. */
export function secretValuePattern(name: SecretName): RegExp {
  return isPlatformClientSecretName(name) ? PLATFORM_CLIENT_SECRET_VALUE_PATTERN : SECRET_VALUE_PATTERN;
}
