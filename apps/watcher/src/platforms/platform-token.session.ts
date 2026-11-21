import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  AccountStore,
  PLATFORM_CLIENTS,
  PLATFORM_MODE_SETTINGS,
  PLATFORM_TOKEN_VAULT,
  PlatformClientError,
  PlatformCredentials,
  PlatformFileCorruptError,
  SecretToken,
  TokenLock,
  TokenVaultUnavailableError,
  accessTokenNeedsRefresh,
  type PlatformClientCredentials,
  type PlatformClients,
  type PlatformModeSettings,
  type PlatformTokenVault,
  type TokenBundle,
  type TokenLease,
} from '@studio/core/platforms';
import { type AccountFile, type Platform, type ReconnectReason } from '@studio/shared/platforms';
import { type Clock } from '../engine/clock';
import { CLOCK } from '../engine/engine.tokens';
import { PlatformEventRecorder } from './platform-event.recorder';
import { PlatformHealthWriter, type ConnectionHealth } from './platform-health.writer';

/** Why no platform call may be made with this connection right now. */
export type TokenBlockedReason =
  | 'disconnected'
  | 'connection-changed'
  | 'token-missing'
  | 'needs-reconnect'
  | 'lock-held'
  | 'credentials-missing'
  /** `health.json` no longer parses, so whether the connection needs a reconnect is unknown (finding R7). */
  | 'health-unknown';

export type TokenAcquisition = { status: 'ready'; bundle: TokenBundle } | { status: 'blocked'; reasonId: TokenBlockedReason };

/** Section 5.2: Instagram long-lived tokens are re-extended when under 15 days remain. */
const INSTAGRAM_EXTEND_MARGIN_MS = 15 * 86_400_000;

/** Bytes of each in-memory mock token; random, so no token literal exists anywhere. */
const MOCK_SEED_TOKEN_BYTES = 24;

const reconnectReasonOf: Readonly<Partial<Record<PlatformClientError['reason'], ReconnectReason>>> = {
  'token-revoked': 'token-revoked',
  denied: 'token-revoked',
  'exchange-failed': 'token-revoked',
  'refresh-expired': 'refresh-expired',
  'scope-missing': 'scope-missing',
};

/** A refresh the platform refused for good (section 5.2), as opposed to a 429, quota, 5xx or network error. */
function reconnectReasonOfError(error: unknown): ReconnectReason | null {
  return error instanceof PlatformClientError ? (reconnectReasonOf[error.reason] ?? null) : null;
}

/**
 * Time kept from the lock budget for the Keychain write that follows a refresh (findings S1, C5):
 * the refresh may use the rest, so the write still ends before `tokenLockBounds.operationBudgetMs`.
 */
const WRITE_RESERVE_MS = 5_000;

/**
 * The lease's budget ran out during the refresh: reported as the platform call's `network` failure,
 * so the step backs off and tries again on a later pass. The late answer is dropped, never written.
 */
function asRefreshFailure(platform: Platform, error: unknown): unknown {
  return error instanceof TokenVaultUnavailableError && error.failure === 'timeout' ? new PlatformClientError(platform, 'refresh', 'network') : error;
}

function blocked(reasonId: TokenBlockedReason): TokenAcquisition {
  return { status: 'blocked', reasonId };
}

function ready(bundle: TokenBundle): TokenAcquisition {
  return { status: 'ready', bundle };
}

/**
 * The watcher's token handling (SPEC 0007 section 5.2). After connect the watcher is the only
 * process that reads or refreshes a platform's tokens, so a rotating refresh token has one user.
 *
 * - Live mode reads the Keychain item through the vault; mock mode has no item (section 5.8) and
 *   starts from an already-expired in-memory bundle, so the first use runs the mock client's refresh
 *   and its `token-revoked` fault takes the same path as a real revocation.
 * - A refresh runs under `token.lock`. After acquiring it, and again after the platform answered,
 *   `account.json` is read: when the account is `disconnected` or its `connectionId` differs from the
 *   bundle's, the refreshed token is dropped and nothing is written (AC 42). Live mode then replaces
 *   the Keychain item; mock mode writes nothing.
 * - A refresh the platform refuses for good writes `health.json` `needs-reconnect`, drops the token
 *   from memory and blocks every further call for that platform until `connectionId` changes (AC 43).
 *   The block is read back from `health.json` too, so it survives a restart (finding C10). The
 *   Keychain item is left for reconnect to replace or disconnect to delete. A `health.json` that no
 *   longer parses blocks that call as `health-unknown` and is moved aside to `health.json.corrupt`;
 *   the next call reads no health file, and a refusal that still applies writes `needs-reconnect`
 *   again (R7).
 * - A live account with no Keychain item writes `needs-reconnect` / `token-missing` the same way
 *   and blocks until `connectionId` changes (round 4 item A); mock mode reads no item at all.
 * - The refresh and the Keychain write run through the lock's lease, so together they end within
 *   `tokenLockBounds.operationBudgetMs` of the acquisition (the refresh leaves `WRITE_RESERVE_MS`
 *   for the write; running out is a `network` failure). The lease's `assertHeld` is asked right
 *   before the write: a lock another process judged stale or took over means no write, reported as
 *   `lock-held` (findings S1, C5).
 * - A 429, quota, 5xx or network error during a refresh is thrown as `PlatformClientError` for the
 *   caller's backoff or failure reason.
 *
 * Token values stay inside `SecretToken`; nothing here logs or writes one.
 */
@Injectable()
export class PlatformTokenSession {
  private readonly bundles = new Map<Platform, TokenBundle>();
  /** Per platform, the connection a refusal blocked, found in this process or in `health.json`. */
  private readonly blockedConnections = new Map<Platform, string>();

  constructor(
    @Inject(PLATFORM_TOKEN_VAULT) private readonly vault: PlatformTokenVault,
    @Inject(PLATFORM_CLIENTS) private readonly clients: PlatformClients,
    @Inject(PLATFORM_MODE_SETTINGS) private readonly modes: PlatformModeSettings,
    @Inject(AccountStore) private readonly accounts: AccountStore,
    @Inject(PlatformCredentials) private readonly credentials: PlatformCredentials,
    @Inject(TokenLock) private readonly lock: TokenLock,
    @Inject(PlatformHealthWriter) private readonly health: PlatformHealthWriter,
    @Inject(PlatformEventRecorder) private readonly events: PlatformEventRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** A bundle for one call on `connectionId`, refreshed first when it is close to expiry. */
  async acquire(platform: Platform, connectionId: string): Promise<TokenAcquisition> {
    const known = await this.current(platform, connectionId);
    if (known.status === 'blocked' || !this.needsRefresh(platform, known.bundle)) return this.reported(platform, connectionId, known);
    return this.reported(platform, connectionId, await this.refresh(platform, known.bundle));
  }

  /** Section 5.2: a 401 or `invalid_grant` on a call triggers exactly one refresh. */
  async refreshAfterRejection(platform: Platform, connectionId: string): Promise<TokenAcquisition> {
    const known = await this.current(platform, connectionId);
    if (known.status === 'blocked') return this.reported(platform, connectionId, known);
    return this.reported(platform, connectionId, await this.refresh(platform, known.bundle));
  }

  private reported(platform: Platform, connectionId: string, acquisition: TokenAcquisition): TokenAcquisition {
    if (acquisition.status === 'blocked') {
      this.events.record({ type: 'platform.token-unavailable', platform, connectionId, reasonId: acquisition.reasonId });
    }
    return acquisition;
  }

  private async current(platform: Platform, connectionId: string): Promise<TokenAcquisition> {
    const health = await this.healthOf(platform, connectionId);
    if (health !== 'clear') return blocked(health === 'blocked' ? 'needs-reconnect' : 'health-unknown');
    // Every platform call needs a token, so this read is what stops all calls after a disconnect (AC 42).
    const account = await this.connectedAccount(platform, connectionId);
    if (account === null) return this.dropped(platform, 'disconnected');
    const cached = this.bundles.get(platform);
    if (cached !== undefined && cached.connectionId === connectionId) return ready(cached);
    this.bundles.delete(platform);
    if (this.modes[platform].mode === 'mock') return ready(this.mockSeed(platform, connectionId));
    const lookup = await this.vault.read(platform);
    if (lookup.status === 'not-found') return this.tokenMissing(platform, account);
    if (lookup.bundle.platform !== platform || lookup.bundle.connectionId !== connectionId) return blocked('connection-changed');
    this.bundles.set(platform, lookup.bundle);
    return ready(lookup.bundle);
  }

  private needsRefresh(platform: Platform, bundle: TokenBundle): boolean {
    const now = this.clock.now();
    if (accessTokenNeedsRefresh(bundle, now)) return true;
    return platform === 'instagram' && Date.parse(bundle.accessExpiresAt) - now.getTime() < INSTAGRAM_EXTEND_MARGIN_MS;
  }

  private async refresh(platform: Platform, bundle: TokenBundle): Promise<TokenAcquisition> {
    const credentials = await this.credentialsFor(platform);
    if (credentials === 'missing') return blocked('credentials-missing');
    try {
      return await this.lock.withLock(platform, (lease) => this.refreshUnderLock(lease, bundle, credentials));
    } catch (error) {
      if (error instanceof TokenVaultUnavailableError && error.failure === 'lock-held') return blocked('lock-held');
      throw error;
    }
  }

  private async refreshUnderLock(lease: TokenLease, bundle: TokenBundle, credentials: PlatformClientCredentials | null): Promise<TokenAcquisition> {
    const { platform } = lease;
    if (!(await this.stillConnected(platform, bundle.connectionId))) return this.dropped(platform, 'disconnected');
    let refreshed: TokenBundle;
    try {
      refreshed = await lease
        .bounded(() => this.clients.clientFor(platform).refresh(bundle, credentials, this.clock.now()), { reserveMs: WRITE_RESERVE_MS })
        .catch((error: unknown) => {
          throw asRefreshFailure(platform, error);
        });
    } catch (error) {
      const reason = reconnectReasonOfError(error);
      if (reason === null) throw error;
      await this.markNeedsReconnect(platform, bundle.connectionId, reason);
      return blocked('needs-reconnect');
    }
    if (refreshed.platform !== platform || refreshed.connectionId !== bundle.connectionId) return this.dropped(platform, 'connection-changed');
    // Read again after the platform answered: a disconnect that won the lock race leaves nothing behind (AC 42).
    if (!(await this.stillConnected(platform, bundle.connectionId))) return this.dropped(platform, 'disconnected');
    if (this.modes[platform].mode === 'live') {
      // A disconnect may have deleted the item since: only the current holder of the lock writes it,
      // and the write is killed rather than outliving the lock budget.
      try {
        await lease.assertHeld();
      } catch (error) {
        if (error instanceof TokenVaultUnavailableError && error.failure === 'lock-held') return this.dropped(platform, 'lock-held');
        throw error;
      }
      await lease.bounded((timeoutMs) => this.vault.write(refreshed, { timeoutMs }));
    }
    this.bundles.set(platform, refreshed);
    this.events.record({ type: 'platform.token-refreshed', platform, connectionId: refreshed.connectionId });
    return ready(refreshed);
  }

  private dropped(platform: Platform, reasonId: TokenBlockedReason): TokenAcquisition {
    this.bundles.delete(platform);
    return blocked(reasonId);
  }

  /**
   * AC 43 across restarts: `health.json` `needs-reconnect` for this connection blocks it like an
   * in-process refusal. An unreadable file blocks this call too (finding R7), but is not remembered:
   * the health writer moved it aside, so the next call reads no file and its token use decides.
   */
  private async healthOf(platform: Platform, connectionId: string): Promise<ConnectionHealth> {
    if (this.blockedConnections.get(platform) === connectionId) return 'blocked';
    const health = await this.health.connectionHealth(platform, connectionId);
    if (health === 'clear') return 'clear';
    this.bundles.delete(platform);
    if (health === 'blocked') this.blockedConnections.set(platform, connectionId);
    return health;
  }

  /**
   * Round 4 item A: no Keychain item for a connection `account.json` shows as connected. A live
   * account keeps its bundle in the vault, so its token is lost (a failed reconnect write, finding
   * F-1, or an item deleted by hand): `health.json` gets `needs-reconnect` / `token-missing` through
   * the same path as a refused refresh, so the status reads "Reconecte a conta" and every further
   * call is blocked until `connectionId` changes. A mock account never has an item (section 5.8),
   * so it only blocks this call and writes nothing. `account.json` is read once more first: a
   * disconnect writes it before it deletes the item, and that is a disconnect, not a lost token.
   */
  private async tokenMissing(platform: Platform, account: AccountFile): Promise<TokenAcquisition> {
    if (account.mode !== 'live') return blocked('token-missing');
    if ((await this.connectedAccount(platform, account.connectionId)) === null) return this.dropped(platform, 'disconnected');
    await this.markNeedsReconnect(platform, account.connectionId, 'token-missing');
    // Same answer as a refused refresh, so the first failed attempt reads `token-revoked`, matching
    // "Reconecte a conta" and AC 43, not `account-not-connected` (critic round 4, minor 2).
    return blocked('needs-reconnect');
  }

  private async markNeedsReconnect(platform: Platform, connectionId: string, reason: ReconnectReason): Promise<void> {
    this.bundles.delete(platform);
    this.blockedConnections.set(platform, connectionId);
    await this.health.markNeedsReconnect(platform, connectionId, reason);
    this.events.record({ type: 'platform.needs-reconnect', platform, connectionId, reason });
  }

  private async stillConnected(platform: Platform, connectionId: string): Promise<boolean> {
    return (await this.connectedAccount(platform, connectionId)) !== null;
  }

  /** `account.json` while it is `connected` on `connectionId`; null otherwise. */
  private async connectedAccount(platform: Platform, connectionId: string): Promise<AccountFile | null> {
    try {
      const account = await this.accounts.read(platform);
      return account !== null && account.state === 'connected' && account.connectionId === connectionId ? account : null;
    } catch (error) {
      // An account file that no longer parses is not a connection: fail closed, write nothing.
      if (error instanceof PlatformFileCorruptError) return null;
      throw error;
    }
  }

  private async credentialsFor(platform: Platform): Promise<PlatformClientCredentials | null | 'missing'> {
    if (this.modes[platform].mode === 'mock') return null;
    const lookup = await this.credentials.lookup(platform);
    return lookup.status === 'present' ? lookup.credentials : 'missing';
  }

  /** Mock mode only: random values that never leave memory, already expired so the mock refresh runs. */
  private mockSeed(platform: Platform, connectionId: string): TokenBundle {
    const now = this.clock.now().toISOString();
    return {
      format: 1,
      platform,
      connectionId,
      accessToken: new SecretToken(randomBytes(MOCK_SEED_TOKEN_BYTES).toString('base64url')),
      accessExpiresAt: now,
      refreshToken: new SecretToken(randomBytes(MOCK_SEED_TOKEN_BYTES).toString('base64url')),
      refreshExpiresAt: null,
      scopes: [],
      obtainedAt: now,
    };
  }
}
