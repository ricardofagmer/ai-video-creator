import { TokenVaultUnavailableError } from '../platforms.errors';
import { type TokenLease } from '../token-lock';
import { type PlatformTokenVault } from './token-vault.port';

/**
 * Deletes the platform's Keychain item under the caller's `token.lock`, bounded by its budget
 * (findings S1, C5). Off macOS there is no Keychain, so no item can exist: `not-found`, which
 * keeps mock mode usable there. Any other failure is thrown for the caller to handle.
 */
export async function deleteTokenItem(vault: PlatformTokenVault, lease: TokenLease): Promise<'deleted' | 'not-found'> {
  try {
    return await lease.bounded((timeoutMs) => vault.delete(lease.platform, { timeoutMs }));
  } catch (error) {
    if (error instanceof TokenVaultUnavailableError && error.failure === 'unsupported-platform') return 'not-found';
    throw error;
  }
}
