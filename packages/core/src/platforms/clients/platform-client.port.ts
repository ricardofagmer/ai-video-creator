import {
  type Platform,
  type PlatformCapability,
  type PlatformMode,
  type PublishAttemptId,
  type PublishFailureReason,
  type PublishMetadata,
} from '@studio/shared/platforms';
import { type FileHandle } from 'node:fs/promises';
import { type PlatformMetrics } from '@studio/shared/metrics';
import { type Secret } from '../../secrets/secret';
import { type PkceChallengeEncoding } from '../oauth/pkce';
import { type SecretToken, type TokenBundle } from '../token-bundle';

/*
 * The one port per platform (SPEC 0007 section 5.8): authorize URL, exchange, identity, refresh,
 * revoke, upload, upload status and metrics, with a live and a mock implementation. Everything a
 * platform returns is untrusted (K10): a live client parses it with zod allowlists, maps errors to
 * `PlatformClientError` reason ids and drops the platform's text. Only clients under
 * `clients/<platform>/` and the mock clients implement it; nothing else makes a platform call.
 */

/** The two OAuth client credentials of a platform, resolved from the environment or the Keychain. */
export interface PlatformClientCredentials {
  clientId: Secret;
  clientSecret: Secret;
}

export interface AuthorizeUrlRequest {
  /** Null in mock mode, where no credential is needed. */
  credentials: PlatformClientCredentials | null;
  redirectUri: string;
  state: string;
  /** The S256 challenge in the client's `pkce` encoding; null when it is `none`. */
  challenge: string | null;
  scopes: readonly string[];
}

export interface CodeExchangeRequest {
  code: SecretToken;
  verifier: SecretToken;
  redirectUri: string;
  credentials: PlatformClientCredentials | null;
  /** The new connection the bundle belongs to. */
  connectionId: string;
  now: Date;
}

/** The connected account as shown on `/contas`; neither field is ever logged (K7). */
export interface PlatformIdentity {
  accountLabel: string;
  platformAccountId: string;
}

export interface UploadRequest {
  attemptId: PublishAttemptId;
  /**
   * The run's `final.mp4`, opened once by the caller with O_NOFOLLOW and hashed from this same
   * handle (finding S2). The client reads the bytes only through it, from position 0, and never
   * opens the file by path; the caller closes it.
   */
  file: FileHandle;
  sizeBytes: number;
  /** The SHA-256 the caller computed from `file`, equal to the request's `artifact.sha256`. */
  sha256: string;
  metadata: PublishMetadata;
  tokens: TokenBundle;
  now: Date;
  /** Called with the bytes sent so far; the caller throttles its `state.json` writes. */
  onProgress(bytesSent: number): void;
}

/** What the platform said once the last byte was accepted. */
export type UploadOutcome =
  | { state: 'processing'; uploadRef: string }
  | { state: 'sent-to-inbox'; uploadRef: string }
  | { state: 'published'; platformVideoId: string; platformMediaId: string | null; publishedAt: string };

export interface UploadStatusRequest {
  attemptId: PublishAttemptId;
  uploadRef: string;
  tokens: TokenBundle;
  now: Date;
}

export type UploadStatus =
  | { state: 'processing' }
  | { state: 'sent-to-inbox' }
  | {
      state: 'published';
      platformVideoId: string;
      platformMediaId: string | null;
      publishedAt: string;
      /**
       * The post link as the platform reported it, when `publicationUrl()` cannot build one (TikTok:
       * the account label is not a handle, owner decision wave 4). Untrusted: the watcher keeps it
       * only when `parsePublicationUrl` recognizes it for the same platform and video id.
       */
      publicationUrl?: string | null;
    }
  | { state: 'failed'; reasonId: PublishFailureReason };

/** One publication to poll (section 5.5). */
export interface MetricTarget {
  publicationId: string;
  platformVideoId: string;
  /** The cached Instagram media id, or null. */
  platformMediaId: string | null;
  /** Today minus the publication day, in local days. */
  dayIndex: number;
}

export type MetricResult =
  | { publicationId: string; status: 'ok'; metrics: PlatformMetrics; platformMediaId: string | null }
  | { publicationId: string; status: 'not-found' | 'not-owned' };

export interface MetricsRequest {
  targets: readonly MetricTarget[];
  tokens: TokenBundle;
  now: Date;
  /**
   * Aborted when the pass budget (`pollRules.passBudgetMs`, section 5.5 step 3) runs out (finding
   * C7). A client stops at the next request boundary and rejects with `PlatformClientError`
   * reason `network`; results already received for other targets are dropped.
   */
  signal: AbortSignal;
}

export interface PlatformClient {
  readonly platform: Platform;
  readonly mode: PlatformMode;
  readonly pkce: PkceChallengeEncoding;
  /** Section 5.2 minimal scopes: identity plus the scopes of `capabilities` (enabled gates only). */
  scopesFor(capabilities: readonly PlatformCapability[]): string[];
  authorizeUrl(request: AuthorizeUrlRequest): string;
  exchangeCode(request: CodeExchangeRequest): Promise<TokenBundle>;
  fetchIdentity(tokens: TokenBundle): Promise<PlatformIdentity>;
  refresh(tokens: TokenBundle, credentials: PlatformClientCredentials | null, now: Date): Promise<TokenBundle>;
  /** Best effort at disconnect; a failure does not stop the delete (section 5.2). */
  revoke(tokens: TokenBundle, credentials: PlatformClientCredentials | null): Promise<void>;
  upload(request: UploadRequest): Promise<UploadOutcome>;
  uploadStatus(request: UploadStatusRequest): Promise<UploadStatus>;
  fetchMetrics(request: MetricsRequest): Promise<MetricResult[]>;
  /**
   * The canonical publication URL for a video this account published, by the SPEC 0006 rules, or
   * null when it cannot be built (a TikTok account label that is not a handle). The caller checks
   * it with `parsePublicationUrl` before storing it.
   */
  publicationUrl(request: { platformVideoId: string; accountLabel: string }): string | null;
}
