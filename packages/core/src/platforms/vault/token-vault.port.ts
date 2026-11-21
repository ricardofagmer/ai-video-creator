import { type Platform } from '@studio/shared/platforms';
import { type TokenBundle } from '../token-bundle';

/*
 * The platform token vault (SPEC 0007 section 5.2, K3): one Keychain item per platform, service
 * `com.videostudio.platform-tokens`. Every write and delete runs under `token.lock` (`TokenLock`);
 * the vault itself does not lock. Implementations never put a token in argv, a file, a log or an
 * error, and fail with `TokenVaultUnavailableError` (reason `keychain-unavailable`).
 */

export type TokenVaultLookup = { status: 'found'; bundle: TokenBundle } | { status: 'not-found' };

/**
 * `timeoutMs`: the time left of the `token.lock` budget (`TokenLease.bounded`, findings S1, C5). A
 * Keychain command still running then is killed, so it cannot write after the lock is released.
 */
export interface TokenVaultCallOptions {
  timeoutMs?: number;
}

export interface PlatformTokenVault {
  /** The platform's bundle, or `not-found`. A corrupt item is `TokenVaultUnavailableError` / `bundle-corrupt`. */
  read(platform: Platform, options?: TokenVaultCallOptions): Promise<TokenVaultLookup>;
  /** Creates or replaces the platform's item with `bundle` (connect, reconnect, the watcher's refresh). */
  write(bundle: TokenBundle, options?: TokenVaultCallOptions): Promise<void>;
  /** Deletes the platform's item; `not-found` when there was none (disconnect). */
  delete(platform: Platform, options?: TokenVaultCallOptions): Promise<'deleted' | 'not-found'>;
}

/** Nest token: the Keychain vault in production, `InMemoryPlatformTokenVault` in tests. */
export const PLATFORM_TOKEN_VAULT = Symbol('PLATFORM_TOKEN_VAULT');

/** Keychain service of the platform tokens (section 5.2); distinct from the provider keys' service. */
export const PLATFORM_TOKEN_KEYCHAIN_SERVICE = 'com.videostudio.platform-tokens';

const platformDisplayNames: Readonly<Record<Platform, string>> = Object.freeze({
  youtube: 'YouTube',
  instagram: 'Instagram',
  tiktok: 'TikTok',
});

/** `Video Studio - <Platform> account tokens`, the item label shown in Keychain Access. */
export function platformTokenKeychainLabel(platform: Platform): string {
  return `Video Studio - ${platformDisplayNames[platform]} account tokens`;
}
