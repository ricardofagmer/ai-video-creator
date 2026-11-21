import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { type PlatformView } from '@studio/shared/api';
import { writeAccountFile } from '@studio/shared/platforms/files';
import { KEYCHAIN_READ_TIMEOUT_MS } from '../../secrets/keychain';
import { PlatformClientError } from '../clients/platform-client.errors';
import { PLATFORM_CLIENTS, type PlatformClients } from '../clients/platform-client.registry';
import { PlatformCredentials } from '../platform-credentials';
import { PLATFORM_MODE_SETTINGS, type PlatformModeSettings } from '../platform-modes.config';
import { PlatformRefusedError, TokenVaultUnavailableError } from '../platforms.errors';
import { DisconnectInputSchema, parsePlatformInput } from '../platforms.input';
import { PLATFORM_CLOCK, PLATFORM_FILE_ROOT, type PlatformClock } from '../platform-runtime';
import { PlatformViewReader } from '../platform-view.reader';
import { PlatformWriteQueue } from '../platform-write.queue';
import { AccountStore } from '../stores/platform-file.stores';
import { type TokenBundle } from '../token-bundle';
import { TokenLock, type TokenLease } from '../token-lock';
import { deleteTokenItem } from '../vault/token-item-delete';
import { PLATFORM_TOKEN_VAULT, type PlatformTokenVault } from '../vault/token-vault.port';
import { DisconnectCommand } from './platform.commands';

/** `revoked`: the platform accepted the revoke. `skipped`: no live call applies. `failed`: best effort lost. */
type RevokeOutcome = 'revoked' | 'skipped' | 'failed';

/** Kept for the Keychain delete while reading and revoking, so a slow revoke cannot starve it. */
const DELETE_RESERVE_MS = KEYCHAIN_READ_TIMEOUT_MS;

/**
 * SPEC 0007 section 5.2 "token.lock", with findings S1 and C5. Under the lock: read the item (a
 * read failure does not stop the rest), `account.json` to `disconnected` first, so no process uses
 * the tokens from then on, a best-effort revoke at the platform when a live bundle exists (the only
 * api platform call besides connect; a failure does not stop the delete), then the Keychain delete,
 * whatever the account's mode: a mock account may sit over an older live item. Every call is
 * bounded by the lock budget (`TokenLease`). A platform with no connected account writes no
 * account file, but its item is still deleted, so a disconnect interrupted after the account write
 * is finished by the next one. The log names the platform, the connection id and the revoke
 * outcome only.
 */
@CommandHandler(DisconnectCommand)
export class DisconnectHandler implements ICommandHandler<DisconnectCommand, PlatformView> {
  private readonly logger = new Logger(DisconnectHandler.name);

  constructor(
    @Inject(PLATFORM_FILE_ROOT) private readonly platformRoot: string,
    @Inject(PLATFORM_CLOCK) private readonly clock: PlatformClock,
    @Inject(PLATFORM_MODE_SETTINGS) private readonly modes: PlatformModeSettings,
    @Inject(PLATFORM_CLIENTS) private readonly clients: PlatformClients,
    @Inject(PLATFORM_TOKEN_VAULT) private readonly vault: PlatformTokenVault,
    private readonly accounts: AccountStore,
    private readonly credentials: PlatformCredentials,
    private readonly tokenLock: TokenLock,
    private readonly queue: PlatformWriteQueue,
    private readonly views: PlatformViewReader,
  ) {}

  async execute(command: DisconnectCommand): Promise<PlatformView> {
    const { platform, correlationId } = parsePlatformInput(DisconnectInputSchema, command.input);
    await this.queue.exclusive(() =>
      this.tokenLock.withLock(platform, async (lease) => {
        const account = await this.accounts.readConnected(platform);
        const bundle = await this.readBundle(lease);
        if (account !== null) {
          await writeAccountFile(this.platformRoot, {
            ...account,
            state: 'disconnected',
            disconnectedAt: this.clock.now().toISOString(),
            correlationId,
          });
        }
        const revoke = bundle === null ? 'skipped' : await this.revoke(lease, bundle);
        const deleted = await deleteTokenItem(this.vault, lease);
        if (account !== null) {
          this.logger.log({ event: 'platform.disconnected', platform, connectionId: account.connectionId, revoke, correlationId });
        } else if (deleted === 'deleted') {
          this.logger.log({ event: 'platform.token-item-deleted', platform, revoke, correlationId });
        }
      }),
    );
    return this.views.viewOf(platform);
  }

  /** The live bundle to revoke, or null; an unreadable item is still deleted afterwards. */
  private async readBundle(lease: TokenLease): Promise<TokenBundle | null> {
    try {
      const lookup = await lease.bounded((timeoutMs) => this.vault.read(lease.platform, { timeoutMs }), { reserveMs: DELETE_RESERVE_MS });
      return lookup.status === 'found' ? lookup.bundle : null;
    } catch (error) {
      if (!(error instanceof TokenVaultUnavailableError)) throw error;
      this.logger.warn({ event: 'platform.token-read-failed', platform: lease.platform, failure: error.failure });
      return null;
    }
  }

  private async revoke(lease: TokenLease, bundle: TokenBundle): Promise<RevokeOutcome> {
    const { platform } = lease;
    // In mock mode the registry gives the offline client, which cannot reach the platform.
    if (this.modes[platform].mode !== 'live') return 'skipped';
    try {
      await lease.bounded(
        async () => {
          const credentials = await this.credentials.lookup(platform);
          await this.clients.clientFor(platform).revoke(bundle, credentials.status === 'present' ? credentials.credentials : null);
        },
        { reserveMs: DELETE_RESERVE_MS },
      );
      return 'revoked';
    } catch (error) {
      // Section 5.2: the delete goes on; the page tells the owner to remove the app's access. A live
      // client not delivered yet (`platform-not-configured`) cannot revoke either, nor can a revoke
      // that outlives its share of the lock budget.
      if (!isRevokeFailure(error)) throw error;
      this.logger.warn({ event: 'platform.revoke-failed', platform, reason: error.reason });
      return 'failed';
    }
  }
}

function isRevokeFailure(error: unknown): error is PlatformClientError | PlatformRefusedError | TokenVaultUnavailableError {
  return error instanceof PlatformClientError || error instanceof PlatformRefusedError || error instanceof TokenVaultUnavailableError;
}
