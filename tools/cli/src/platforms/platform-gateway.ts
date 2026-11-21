import { type MetricBatchIngestSummary } from '@studio/core/metrics';
import { type PublishSyncSummary, type RequestPublishResult } from '@studio/core/platforms';
import { type GateChangeRequest, type PlatformView, type PlatformsView, type PublishRequest, type RunPublishView } from '@studio/shared/api';
import { type Platform } from '@studio/shared/platforms';
import { type RunId } from '@studio/shared/run-format';

/** What `studio runs publish` sends; the actor, origin and correlation id are added by the adapter. */
export interface PublishSubmission {
  runId: RunId;
  platform: Platform;
  request: PublishRequest;
}

/**
 * What the platform commands, `studio status`, `studio runs show` and `studio doctor` need from
 * core (SPEC 0007 section 5.9). The production adapter (`nest-platform-gateway.ts`) runs the core
 * `PlatformsModule` and `MetricsModule` handlers, the same ones the api boots, so `gates.json`,
 * `account.json`, `request.json`, the Keychain item and `publication_attempts` keep their writers
 * (ADR 0003). The CLI never writes `health.json`, `claim`, `state.json`, `cursor.json` or
 * `publications.jsonl` (K2), and never starts a connection: connect is web-only.
 */
export interface PlatformGateway {
  /** `GetPlatformsQuery`: the three platforms, each once. */
  list(): Promise<PlatformsView>;
  /** `SetPlatformGateCommand`; the owner's explicit action only. */
  setGate(platform: Platform, change: GateChangeRequest): Promise<PlatformView>;
  /** `DisconnectCommand`: best-effort revoke, Keychain delete, `account.json` to `disconnected`. */
  disconnect(platform: Platform): Promise<PlatformView>;
  /** `IngestMetricBatchCommand` over every file in the metrics inbox. */
  syncMetrics(): Promise<MetricBatchIngestSummary>;
  /** `SyncPublishAttemptsCommand` over every open attempt (doctor). */
  syncAttempts(): Promise<PublishSyncSummary>;
  /** `SyncPublishAttemptsCommand(runId)` first, then `GetRunPublishQuery(runId)`. */
  runPublish(runId: RunId): Promise<RunPublishView>;
  /** `RequestPublishCommand` with `createdBy: 'cli'` (K4). */
  requestPublish(submission: PublishSubmission): Promise<RequestPublishResult>;
}
