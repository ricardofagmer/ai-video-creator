import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { connectionRedirectUri } from '@studio/shared/api';
import { AccountFileSchema, type AccountFile, type Platform } from '@studio/shared/platforms';
import { readAccountFile, writeAccountFile } from '@studio/shared/platforms/files';
import { RunFileError, newUlid } from '@studio/shared/run-files';
import { KEYCHAIN_READ_TIMEOUT_MS } from '../../secrets/keychain';
import { PlatformClientError } from '../clients/platform-client.errors';
import { PLATFORM_CLIENTS, type PlatformClients } from '../clients/platform-client.registry';
import { type PlatformClient, type PlatformClientCredentials, type PlatformIdentity } from '../clients/platform-client.port';
import { OAUTH_STATE_STORE, type OAuthStateStore, type PendingConnection } from '../oauth/oauth-state.store';
import { PlatformCredentials } from '../platform-credentials';
import { PLATFORM_MODE_SETTINGS, type PlatformModeSettings } from '../platform-modes.config';
import { PlatformError, PlatformRefusedError, TokenVaultUnavailableError } from '../platforms.errors';
import { CompleteConnectionInputSchema, parsePlatformInput, type CompleteConnectionFields } from '../platforms.input';
import { PLATFORM_CLOCK, PLATFORM_FILE_ROOT, type PlatformClock } from '../platform-runtime';
import { PlatformWriteQueue } from '../platform-write.queue';
import { SecretToken, type TokenBundle } from '../token-bundle';
import { TokenLock, type TokenLease } from '../token-lock';
import { deleteTokenItem } from '../vault/token-item-delete';
import { PLATFORM_TOKEN_VAULT, type PlatformTokenVault } from '../vault/token-vault.port';
import { CompleteConnectionCommand, type ConnectionCompleted } from './platform.commands';

/**
 * Finding F-1: kept out of the vault write's share of the lock budget, so the cleanup after a failed
 * write still fits in it: the delete of a half-written item, or (replace case) the read-back and the
 * delete that follows it.
 */
const DISCARD_RESERVE_MS = KEYCHAIN_READ_TIMEOUT_MS;

/** Finding F-1, replace case: the part of the reserve the read-back leaves for its delete. */
const DELETE_AFTER_READ_BACK_RESERVE_MS = DISCARD_RESERVE_MS / 2;

/** A platform call failure during connect, as its rev 7 reason; the platform's text is dropped. */
function connectRefusal(error: PlatformClientError, platform: Platform): PlatformRefusedError {
  if (error.reason === 'denied') return new PlatformRefusedError('oauth-denied', platform);
  if (error.reason === 'scope-missing') return new PlatformRefusedError('oauth-scope-missing', platform);
  return new PlatformRefusedError('oauth-exchange-failed', platform);
}

/**
 * SPEC 0007 section 5.2 step 2, in order, the first failure storing nothing: `state` known, unused,
 * unexpired and bound to this session; no `error` parameter; the code exchanged server-side with
 * the verifier; the granted scopes cover the requested ones; one identity call; then `token.lock`,
 * the Keychain item, and `account.json` with a new `connectionId`. A reconnect is the same flow and
 * replaces both. Findings S1 and C5: a live connect writes the item only while this process still
 * holds the lock, and deletes it again when `account.json` then fails to write, so no item outlives
 * a failed connect. Finding F-1: a vault write that fails may still have landed the item, so when no
 * live account was connected before, the item is deleted then too. With one (the replace case), the
 * item is read back inside the write's reserve: when it decodes to the new `connectionId` the old
 * bundle is already gone and the new one is deleted (the watcher then finds no item and writes
 * `health.json` `needs-reconnect` / `token-missing`); otherwise it is still the working connection's token and is left alone. A mock
 * connect writes no item (section 5.8) and deletes an earlier live one, so
 * a mock account never sits over a live, upload-capable token. Every Keychain command is bounded by
 * the lock budget.
 * The api uses the tokens for the identity call only and keeps none of them in memory afterwards.
 * Neither the code, the `state` nor the account label is logged (K7).
 */
@CommandHandler(CompleteConnectionCommand)
export class CompleteConnectionHandler implements ICommandHandler<CompleteConnectionCommand, ConnectionCompleted> {
  private readonly logger = new Logger(CompleteConnectionHandler.name);

  constructor(
    @Inject(PLATFORM_FILE_ROOT) private readonly platformRoot: string,
    @Inject(PLATFORM_CLOCK) private readonly clock: PlatformClock,
    @Inject(PLATFORM_MODE_SETTINGS) private readonly modes: PlatformModeSettings,
    @Inject(PLATFORM_CLIENTS) private readonly clients: PlatformClients,
    @Inject(OAUTH_STATE_STORE) private readonly states: OAuthStateStore,
    @Inject(PLATFORM_TOKEN_VAULT) private readonly vault: PlatformTokenVault,
    private readonly credentials: PlatformCredentials,
    private readonly tokenLock: TokenLock,
    private readonly queue: PlatformWriteQueue,
  ) {}

  async execute(command: CompleteConnectionCommand): Promise<ConnectionCompleted> {
    const fields = parsePlatformInput(CompleteConnectionInputSchema, command.input);
    try {
      const completed = await this.complete(fields);
      const { platform, correlationId } = fields;
      this.logger.log({ event: 'platform.connected', platform, connectionId: completed.connectionId, correlationId });
      return completed;
    } catch (error) {
      if (error instanceof PlatformError) {
        const { platform, correlationId } = fields;
        this.logger.log({ event: 'platform.connect-refused', platform, reason: error.reason, correlationId });
      }
      throw error;
    }
  }

  private async complete(fields: CompleteConnectionFields): Promise<ConnectionCompleted> {
    const { platform } = fields;
    const now = this.clock.now();
    const pending = this.consumeState(fields, now);
    if (fields.error !== null) throw new PlatformRefusedError('oauth-denied', platform);
    if (fields.code === null) throw new PlatformRefusedError('oauth-state-invalid', platform);
    if (pending.mode !== this.modes[platform].mode) throw new PlatformRefusedError('platform-mode-mismatch', platform);

    const client = this.clients.clientFor(platform);
    const credentials = await this.credentialsFor(pending);
    const connectionId = newUlid(now.getTime());
    const bundle = await this.exchange(client, {
      code: new SecretToken(fields.code),
      pending,
      credentials,
      redirectUri: connectionRedirectUri({ apiPort: fields.apiPort, platform }),
      connectionId,
      now,
    });
    const account = this.accountOf({ fields, pending, identity: await this.identity(client, bundle), connectionId, now });

    await this.queue.exclusive(() =>
      this.tokenLock.withLock(platform, async (lease) => {
        if (pending.mode === 'live') await this.storeLive(lease, bundle, account);
        else await this.storeMock(lease, account);
      }),
    );
    return { platform, connectionId };
  }

  private async storeLive(lease: TokenLease, bundle: TokenBundle, account: AccountFile): Promise<void> {
    const replacesLiveConnection = await this.hasLiveConnection(lease.platform);
    await lease.assertHeld();
    try {
      await lease.bounded((timeoutMs) => this.vault.write(bundle, { timeoutMs }), { reserveMs: DISCARD_RESERVE_MS });
    } catch (error) {
      if (!replacesLiveConnection) await this.discardItem(lease);
      else if (await this.itemHoldsConnection(lease, account.connectionId)) await this.discardItem(lease);
      throw error;
    }
    try {
      await writeAccountFile(this.platformRoot, account);
    } catch (error) {
      await this.discardItem(lease);
      throw error;
    }
  }

  private async storeMock(lease: TokenLease, account: AccountFile): Promise<void> {
    await deleteTokenItem(this.vault, lease);
    await writeAccountFile(this.platformRoot, account);
  }

  /**
   * Whether a live account is connected now, read under the lock. A corrupt `account.json` counts
   * as none: no process can use the item behind it, so discarding the item breaks no connection.
   */
  private async hasLiveConnection(platform: Platform): Promise<boolean> {
    try {
      const file = await readAccountFile(this.platformRoot, platform);
      return file.status === 'present' && file.value.state === 'connected' && file.value.mode === 'live';
    } catch (error) {
      if (error instanceof RunFileError) return false;
      throw error;
    }
  }

  /**
   * Finding F-1, replace case: whether the item now decodes to `connectionId`, read with the
   * write's reserve less the delete's share. A read that fails answers `false` (nothing is deleted
   * on a guess) and is logged by its failure id only; it never replaces the original error.
   */
  private async itemHoldsConnection(lease: TokenLease, connectionId: string): Promise<boolean> {
    try {
      const lookup = await lease.bounded((timeoutMs) => this.vault.read(lease.platform, { timeoutMs }), {
        reserveMs: DELETE_AFTER_READ_BACK_RESERVE_MS,
      });
      return lookup.status === 'found' && lookup.bundle.connectionId === connectionId;
    } catch (error) {
      this.logger.warn({ event: 'platform.token-item-read-back-failed', platform: lease.platform, failure: failureIdOf(error) });
      return false;
    }
  }

  /**
   * Best effort after a failed write; the original error is what the caller sees. Only while this
   * process still holds the lock: once it is lost, another holder may have written its own item. A
   * failure is logged by its failure id only and never replaces the original error.
   */
  private async discardItem(lease: TokenLease): Promise<void> {
    try {
      await lease.assertHeld();
      await deleteTokenItem(this.vault, lease);
    } catch (error) {
      this.logger.warn({ event: 'platform.token-item-discard-failed', platform: lease.platform, failure: failureIdOf(error) });
    }
  }

  private consumeState(fields: CompleteConnectionFields, now: Date): PendingConnection {
    if (fields.state === null) throw new PlatformRefusedError('oauth-state-invalid', fields.platform);
    const consumed = this.states.consume({ state: fields.state, platform: fields.platform, sessionId: fields.sessionId, now });
    if (consumed.status === 'invalid') throw new PlatformRefusedError('oauth-state-invalid', fields.platform);
    return consumed.pending;
  }

  private async credentialsFor(pending: PendingConnection): Promise<PlatformClientCredentials | null> {
    if (pending.mode === 'mock') return null;
    const lookup = await this.credentials.lookup(pending.platform);
    if (lookup.status === 'missing') throw new PlatformRefusedError('platform-not-configured', pending.platform);
    return lookup.credentials;
  }

  private async exchange(
    client: PlatformClient,
    request: {
      code: SecretToken;
      pending: PendingConnection;
      credentials: PlatformClientCredentials | null;
      redirectUri: string;
      connectionId: string;
      now: Date;
    },
  ): Promise<TokenBundle> {
    const { pending } = request;
    let bundle: TokenBundle;
    try {
      bundle = await client.exchangeCode({
        code: request.code,
        verifier: pending.verifier,
        redirectUri: request.redirectUri,
        credentials: request.credentials,
        connectionId: request.connectionId,
        now: request.now,
      });
    } catch (error) {
      if (error instanceof PlatformClientError) throw connectRefusal(error, pending.platform);
      throw error;
    }
    if (bundle.platform !== pending.platform || bundle.connectionId !== request.connectionId) {
      throw new PlatformRefusedError('oauth-exchange-failed', pending.platform);
    }
    const granted = new Set(bundle.scopes);
    if (!pending.scopes.every((scope) => granted.has(scope))) throw new PlatformRefusedError('oauth-scope-missing', pending.platform);
    return bundle;
  }

  private async identity(client: PlatformClient, bundle: TokenBundle): Promise<PlatformIdentity> {
    try {
      return await client.fetchIdentity(bundle);
    } catch (error) {
      if (error instanceof PlatformClientError) throw connectRefusal(error, client.platform);
      throw error;
    }
  }

  /** The new `account.json`, checked against its schema before anything is stored. */
  private accountOf(options: {
    fields: CompleteConnectionFields;
    pending: PendingConnection;
    identity: PlatformIdentity;
    connectionId: string;
    now: Date;
  }): AccountFile {
    const { fields, pending, identity } = options;
    const candidate = AccountFileSchema.safeParse({
      format: 1,
      platform: fields.platform,
      connectionId: options.connectionId,
      state: 'connected',
      mode: pending.mode,
      accountLabel: identity.accountLabel,
      platformAccountId: identity.platformAccountId,
      scopes: pending.scopes,
      capabilities: pending.capabilities,
      connectedAt: options.now.toISOString(),
      connectedBy: fields.connectedBy,
      disconnectedAt: null,
      correlationId: fields.correlationId,
    });
    // An identity the account file cannot hold is the platform's malformed answer, never stored.
    if (!candidate.success) throw new PlatformRefusedError('oauth-exchange-failed', fields.platform);
    return candidate.data;
  }
}

/** The vault's failure id, never the error's text (which may hold a path or worse). */
function failureIdOf(error: unknown): string {
  return error instanceof TokenVaultUnavailableError ? error.failure : 'unexpected';
}
