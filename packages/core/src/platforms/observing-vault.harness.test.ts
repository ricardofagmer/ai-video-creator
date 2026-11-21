import { type Platform } from '@studio/shared/platforms';
import { type TokenBundle } from './token-bundle';
import { InMemoryPlatformTokenVault } from './vault/in-memory-token-vault';
import { type TokenVaultCallOptions, type TokenVaultLookup } from './vault/token-vault.port';

/*
 * Test-only vault (SPEC 0007 section 5.2, findings S1, C5 and F-1): the in-memory vault with hooks
 * run right before a write (the item is not stored when it throws), right after a successful write,
 * right before a read and right before a delete, so a test can observe the files at that moment or
 * break the step. Helpers only: the `.harness.test.ts` name
 * keeps the file out of the build; it declares no test.
 */
export class ObservingTokenVault extends InMemoryPlatformTokenVault {
  beforeWrite: (() => Promise<void>) | null = null;
  afterWrite: (() => Promise<void>) | null = null;
  beforeRead: (() => Promise<void>) | null = null;
  beforeDelete: (() => Promise<void>) | null = null;
  /** The `timeoutMs` each write was given (its share of the lock budget), in call order. */
  readonly writeTimeouts: (number | undefined)[] = [];
  /** The `timeoutMs` each read was given, in call order. */
  readonly readTimeouts: (number | undefined)[] = [];

  override async write(bundle: TokenBundle, options?: TokenVaultCallOptions): Promise<void> {
    this.writeTimeouts.push(options?.timeoutMs);
    if (this.beforeWrite !== null) await this.beforeWrite();
    await super.write(bundle);
    if (this.afterWrite !== null) await this.afterWrite();
  }

  override async read(platform: Platform, options?: TokenVaultCallOptions): Promise<TokenVaultLookup> {
    this.readTimeouts.push(options?.timeoutMs);
    if (this.beforeRead !== null) await this.beforeRead();
    return super.read(platform);
  }

  override async delete(platform: Platform): Promise<'deleted' | 'not-found'> {
    if (this.beforeDelete !== null) await this.beforeDelete();
    return super.delete(platform);
  }
}
