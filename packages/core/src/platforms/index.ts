/**
 * Connected platforms (SPEC 0007, `@studio/core/platforms`). The api and the CLI import
 * `PlatformsModule`; the watcher imports `PlatformsReadModule`, which registers no handler. The
 * OAuth token bundle and `SecretToken` are Node-only and live here, never in `@studio/shared`.
 */
export { PlatformsModule } from './platforms.module';
export { PlatformsReadModule } from './platforms-read.module';
export {
  CancelPublishCommand,
  CompleteConnectionCommand,
  DisconnectCommand,
  RequestPublishCommand,
  SetPlatformGateCommand,
  StartConnectionCommand,
  SyncPublishAttemptsCommand,
  type ConnectionCompleted,
  type PublishSyncSummary,
  type RequestPublishResult,
} from './commands/platform.commands';
export { GetPlatformsQuery, GetRunPublishQuery } from './queries/platform.queries';
export {
  type CancelPublishInput,
  type CompleteConnectionInput,
  type DisconnectInput,
  type RequestPublishInput,
  type SetPlatformGateInput,
  type StartConnectionInput,
} from './platforms.input';
export {
  InvalidPlatformInputError,
  PlatformError,
  PlatformFileCorruptError,
  PlatformRefusedError,
  PlatformRowCorruptError,
  PublishAttemptNotFoundError,
  PublishRequestWriteFailedError,
  TokenVaultUnavailableError,
  type PlatformErrorCategory,
  type PlatformErrorReason,
  type TokenVaultFailure,
  type TokenVaultOperation,
} from './platforms.errors';
export {
  InvalidPlatformModeConfigError,
  PLATFORM_MODE_SETTINGS,
  PlatformMockFaultSchema,
  platformMockFaultVariable,
  platformModeVariable,
  readPlatformModeSettings,
  type PlatformMockFault,
  type PlatformModeSettings,
  type PlatformModeState,
} from './platform-modes.config';
export { PLATFORM_CLOCK, PLATFORM_FILE_ROOT, PLATFORM_PROCESS_ID, localDateOf, type PlatformClock } from './platform-runtime';
export { PlatformCredentials, type CredentialsLookup } from './platform-credentials';
export { PlatformStatusReader, toPlatformView, type PlatformSnapshot } from './platform-status.reader';
export { PlatformViewReader } from './platform-view.reader';
export { PublicationTrackingReader, cursorEntryOf, publicationPolling, type PublicationPollingFacts } from './publication-tracking';
export { AccountStore, GateStore, HealthReader } from './stores/platform-file.stores';
export { PublishFileReader } from './stores/publish-file.reader';
export { LATE_SETTLE_GRACE_MS, TokenLock, type TokenLease } from './token-lock';
export {
  ACCESS_TOKEN_REFRESH_MARGIN_MS,
  SecretToken,
  TokenBundleInvalidError,
  accessTokenNeedsRefresh,
  type TokenBundle,
} from './token-bundle';
export { PLATFORM_TOKEN_VAULT, type PlatformTokenVault, type TokenVaultCallOptions, type TokenVaultLookup } from './vault/token-vault.port';
export { KeychainPlatformTokenVault } from './vault/keychain-token-vault';
export { InMemoryPlatformTokenVault } from './vault/in-memory-token-vault';
export { InMemoryOAuthStateStore, OAUTH_STATE_STORE, type OAuthStateStore, type PendingConnection } from './oauth/oauth-state.store';
export { LIVE_PLATFORM_CLIENT_CONTEXT, PLATFORM_CLIENTS, PlatformClientRegistry, type PlatformClients } from './clients/platform-client.registry';
export { PlatformClientError, type PlatformClientErrorReason, type PlatformClientOperation } from './clients/platform-client.errors';
export { type LivePlatformClientContext, type LivePlatformClientFactory } from './clients/live-client-factory';
export {
  type MetricResult,
  type MetricTarget,
  type PlatformClient,
  type PlatformClientCredentials,
  type PlatformIdentity,
  type UploadOutcome,
  type UploadRequest,
  type UploadStatus,
} from './clients/platform-client.port';
