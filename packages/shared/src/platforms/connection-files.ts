import { z } from 'zod';
import { ConnectionIdSchema, CorrelationIdSchema, IsoDateTimeSchema } from '../common/ids';
import { PlatformSchema } from '../metrics/enums';
import { pollRules } from './constants';
import {
  GateStateSchema,
  PlatformCapabilitySchema,
  PlatformModeSchema,
  PollBackoffReasonSchema,
  ReconnectReasonSchema,
} from './enums';

/*
 * Connection files under `<data home>/platform/` (SPEC 0007 sections 4.3 and 4.6). None of them
 * holds a token, a code, a `state`, a verifier or a client secret: tokens live only in the
 * Keychain and in process memory (K3).
 */

/** Both gates of one platform, as stored. */
export const PlatformGatesSchema = z.object({ metrics: GateStateSchema, publish: GateStateSchema }).strict();

/**
 * `platform/gates.json`; writer: the api or the CLI, only on the owner's explicit action. The
 * record is exhaustive: every platform has an entry. A missing file reads as `defaultGates`.
 */
export const GatesFileSchema = z
  .object({
    format: z.literal(1),
    gates: z.record(PlatformSchema, PlatformGatesSchema),
    updatedAt: IsoDateTimeSchema,
    updatedBy: z.string().min(1).max(100),
  })
  .strict();
export type GatesFile = z.infer<typeof GatesFileSchema>;

/**
 * `platform/accounts/<platform>/account.json`; writer: the api or the CLI (connect, disconnect).
 * `accountLabel` (channel title or @handle) and `platformAccountId` are shown, never logged (K7).
 * Rules: `disconnectedAt` is set exactly when `state` is `disconnected`; `capabilities` are unique.
 */
export const AccountFileSchema = z
  .object({
    format: z.literal(1),
    platform: PlatformSchema,
    connectionId: ConnectionIdSchema,
    state: z.enum(['connected', 'disconnected']),
    mode: PlatformModeSchema,
    accountLabel: z.string().max(100),
    platformAccountId: z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/),
    scopes: z.array(z.string().max(120)).max(12),
    capabilities: z.array(PlatformCapabilitySchema).max(2),
    connectedAt: IsoDateTimeSchema,
    connectedBy: z.string().min(1).max(100),
    disconnectedAt: IsoDateTimeSchema.nullable(),
    correlationId: CorrelationIdSchema.nullable(),
  })
  .strict()
  .superRefine((account, context) => {
    if ((account.state === 'disconnected') !== (account.disconnectedAt !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['disconnectedAt'],
        message: 'disconnectedAt is set exactly when state is disconnected',
      });
    }
    if (new Set(account.capabilities).size !== account.capabilities.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['capabilities'], message: 'capabilities must be unique' });
    }
  });
export type AccountFile = z.infer<typeof AccountFileSchema>;

/** The poll backoff of one platform (section 5.7); `level` counts consecutive failed passes. */
export const PollBackoffSchema = z
  .object({
    reasonId: PollBackoffReasonSchema,
    level: z.number().int().min(1).max(pollRules.backoffHours.length),
    until: IsoDateTimeSchema,
  })
  .strict();
export type PollBackoff = z.infer<typeof PollBackoffSchema>;

/**
 * `platform/accounts/<platform>/health.json`; writer: the watcher only, between runs. It applies to
 * the `connectionId` it names; a reconnect issues a new id, so an older health file no longer
 * applies. Rule: `reconnectReason` is set exactly when `token` is `needs-reconnect`.
 */
export const HealthFileSchema = z
  .object({
    format: z.literal(1),
    platform: PlatformSchema,
    connectionId: ConnectionIdSchema,
    token: z.enum(['ok', 'needs-reconnect']),
    reconnectReason: ReconnectReasonSchema.nullable(),
    checkedAt: IsoDateTimeSchema,
    backoff: PollBackoffSchema.nullable(),
    lastPollAt: IsoDateTimeSchema.nullable(),
  })
  .strict()
  .superRefine((health, context) => {
    if ((health.token === 'needs-reconnect') !== (health.reconnectReason !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reconnectReason'],
        message: 'reconnectReason is set exactly when token is needs-reconnect',
      });
    }
  });
export type HealthFile = z.infer<typeof HealthFileSchema>;
