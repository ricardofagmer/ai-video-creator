import { z } from 'zod';

/*
 * Platform protocol enums (SPEC 0007 section 4.2). `PlatformSchema` itself is reused from
 * `@studio/shared/metrics` so the three platforms are named once.
 */

/** The two things a platform can do for the studio; each has its own gate (OD2). */
export const PlatformCapabilitySchema = z.enum(['metrics', 'publish']);
export type PlatformCapability = z.infer<typeof PlatformCapabilitySchema>;

/** Only the owner changes a gate; the studio cannot see a platform's review result (section 5.3). */
export const GateStateSchema = z.enum(['awaiting-review', 'enabled']);
export type GateState = z.infer<typeof GateStateSchema>;

/** Derived per platform and capability by `capabilityStatus` (section 5.3); never stored. */
export const CapabilityStatusSchema = z.enum([
  'unsupported',
  'awaiting-review',
  'not-configured',
  'disconnected',
  'connected',
  'needs-reconnect',
]);
export type CapabilityStatus = z.infer<typeof CapabilityStatusSchema>;

/** Why a connection needs the owner to connect again (section 5.2). */
export const ReconnectReasonSchema = z.enum(['token-revoked', 'refresh-expired', 'scope-missing', 'account-changed', 'token-missing']);
export type ReconnectReason = z.infer<typeof ReconnectReasonSchema>;

/** Per platform, from `VIDEO_STUDIO_PLATFORM_<PLATFORM>_MODE`; `mock` is the default (section 5.8). */
export const PlatformModeSchema = z.enum(['mock', 'live']);
export type PlatformMode = z.infer<typeof PlatformModeSchema>;

/**
 * One publish attempt's state (section 4.2). The first four are open; the others are terminal.
 * The allowed moves are `canTransitionPublishState` (`publish-state.ts`).
 */
export const PublishStateSchema = z.enum([
  'queued',
  'uploading',
  'processing',
  'sent-to-inbox',
  'published',
  'failed',
  'cancelled',
  'expired',
  'outcome-unknown',
  'inbox-unconfirmed',
]);
export type PublishState = z.infer<typeof PublishStateSchema>;

/** The one reason a terminal `failed` attempt carries (section 5.4). */
export const PublishFailureReasonSchema = z.enum([
  'run-not-approved',
  'gate-closed',
  'mode-mismatch',
  'account-not-connected',
  'token-revoked',
  'scope-missing',
  'quota-exhausted',
  'rate-limited',
  'artifact-missing',
  'artifact-changed',
  'media-rejected',
  'metadata-rejected',
  'policy-rejected',
  'account-not-eligible',
  'network',
  'platform-unavailable',
  'watcher-interrupted',
  'internal-error',
]);
export type PublishFailureReason = z.infer<typeof PublishFailureReasonSchema>;

/** The owner's choice in the dialog; no option is preselected (B7). Allowed values per platform: `allowedVisibilities`. */
export const VisibilitySchema = z.enum(['public', 'unlisted', 'private']);
export type Visibility = z.infer<typeof VisibilitySchema>;

/** Why polling of one publication ended for good (section 5.5). */
export const PollStopReasonSchema = z.enum(['window-closed', 'not-found', 'not-owned', 'publication-removed']);
export type PollStopReason = z.infer<typeof PollStopReasonSchema>;

/** Why a platform's poll pass ended early and waits (section 5.7). */
export const PollBackoffReasonSchema = z.enum(['rate-limited', 'quota-exhausted', 'platform-unavailable', 'network']);
export type PollBackoffReason = z.infer<typeof PollBackoffReasonSchema>;
