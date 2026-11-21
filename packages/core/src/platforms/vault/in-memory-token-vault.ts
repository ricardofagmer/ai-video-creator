import { type Platform } from '@studio/shared/platforms';
import { TokenVaultUnavailableError } from '../platforms.errors';
import { TokenBundleInvalidError, decodeTokenBundle, encodeTokenBundle, type SecretToken, type TokenBundle } from '../token-bundle';
import { type PlatformTokenVault, type TokenVaultLookup } from './token-vault.port';

/**
 * The test double of `PlatformTokenVault` (SPEC 0007 section 12: "a fake vault"). It stores the
 * same encoded form the Keychain item holds, so the size bound and the schema apply exactly as in
 * production, and counts operations so a test can prove which process wrote or deleted. No
 * production module provides it.
 */
export class InMemoryPlatformTokenVault implements PlatformTokenVault {
  private readonly items = new Map<Platform, SecretToken>();
  private readonly counts = { reads: 0, writes: 0, deletes: 0 };
  private unavailable = false;

  async read(platform: Platform): Promise<TokenVaultLookup> {
    this.counts.reads += 1;
    if (this.unavailable) throw new TokenVaultUnavailableError(platform, 'read', 'command-failed');
    const encoded = this.items.get(platform);
    return encoded === undefined ? { status: 'not-found' } : { status: 'found', bundle: decodeTokenBundle(encoded) };
  }

  async write(bundle: TokenBundle): Promise<void> {
    this.counts.writes += 1;
    if (this.unavailable) throw new TokenVaultUnavailableError(bundle.platform, 'write', 'command-failed');
    try {
      this.items.set(bundle.platform, encodeTokenBundle(bundle));
    } catch (error) {
      if (error instanceof TokenBundleInvalidError) throw new TokenVaultUnavailableError(bundle.platform, 'write', 'bundle-too-large');
      throw error;
    }
  }

  async delete(platform: Platform): Promise<'deleted' | 'not-found'> {
    this.counts.deletes += 1;
    if (this.unavailable) throw new TokenVaultUnavailableError(platform, 'delete', 'command-failed');
    return this.items.delete(platform) ? 'deleted' : 'not-found';
  }

  /** Makes every later call fail as an unreachable Keychain would. */
  failAll(unavailable: boolean): void {
    this.unavailable = unavailable;
  }

  has(platform: Platform): boolean {
    return this.items.has(platform);
  }

  operationCounts(): Readonly<{ reads: number; writes: number; deletes: number }> {
    return { ...this.counts };
  }
}
