import { z } from 'zod';
import { IsoDateTimeSchema } from '../common/ids';
import { PlatformSchema, type Platform } from '../metrics/enums';
import { PlatformGatesSchema, PollBackoffSchema } from '../platforms/connection-files';
import { CapabilityStatusSchema, GateStateSchema, PlatformCapabilitySchema, PlatformModeSchema, ReconnectReasonSchema, RevokeOutcomeSchema } from '../platforms/enums';
import { ApiRev7ErrorReasonSchema } from './common';
import { apiPaths } from './routes';

/*
 * C10 rev 7 platform routes (SPEC 0007 sections 4.4, 5.2 and 5.3). Every route needs the passphrase
 * session; the non-GET ones also the allowlisted `Origin`. `updatedBy`, `connectedBy` and
 * `correlationId` come from the session and `x-request-id`, never from a body. No view carries a
 * token, a code, a `state`, a verifier, a client secret or a platform account id.
 */

/** `:platform` of every platform route, checked with `PlatformSchema`. */
export const PlatformParamsSchema = z.object({ platform: PlatformSchema }).strict();
export type PlatformParams = z.infer<typeof PlatformParamsSchema>;

/**
 * `PATCH /platforms/:platform/gate`: the owner's gate change. Enabling Instagram `publish` answers
 * 409 `platform-publish-unsupported` and writes nothing (OD8).
 */
export const GateChangeRequestSchema = z.object({ capability: PlatformCapabilitySchema, state: GateStateSchema }).strict();
export type GateChangeRequest = z.infer<typeof GateChangeRequestSchema>;

/**
 * One platform on `/contas` (section 4.4). `status` is `capabilityStatus` per capability.
 * `accountLabel` (channel title or @handle) is shown as a text node and never logged.
 * `importFallback` is always true: the R3 CSV and form import stay available in every state.
 */
export const PlatformViewSchema = z
  .object({
    platform: PlatformSchema,
    mode: PlatformModeSchema,
    gates: PlatformGatesSchema,
    status: z.object({ metrics: CapabilityStatusSchema, publish: CapabilityStatusSchema }).strict(),
    reconnectReason: ReconnectReasonSchema.nullable(),
    accountLabel: z.string().max(100).nullable(),
    connectedAt: IsoDateTimeSchema.nullable(),
    lastPollAt: IsoDateTimeSchema.nullable(),
    backoff: PollBackoffSchema.nullable(),
    trackedPublications: z.number().int().nonnegative(),
    importFallback: z.literal(true),
  })
  .strict();
export type PlatformView = z.infer<typeof PlatformViewSchema>;

/**
 * `DELETE /platforms/:platform/connection` (200): the platform after the disconnect, plus the
 * outcome of the best-effort revoke (owner decision 2026-11-21), so the page asks the owner to
 * remove the app's access on the platform only when the revoke was not confirmed.
 */
export const DisconnectResultSchema = PlatformViewSchema.extend({ revoke: RevokeOutcomeSchema }).strict();
export type DisconnectResult = z.infer<typeof DisconnectResultSchema>;

/** `GET /platforms` (200): the three platforms, each exactly once. */
export const PlatformsViewSchema = z
  .object({ platforms: z.array(PlatformViewSchema).length(PlatformSchema.options.length) })
  .strict()
  .superRefine((view, context) => {
    if (new Set(view.platforms.map((entry) => entry.platform)).size !== view.platforms.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['platforms'], message: 'each platform appears once' });
    }
  });
export type PlatformsView = z.infer<typeof PlatformsViewSchema>;

/**
 * An authorize URL the web may open in the same tab: `https` at the platform, or the api's own
 * `http://127.0.0.1` callback in mock mode (section 5.8). Anything else is refused.
 */
function isAllowedAuthorizeUrl(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  if (url.username !== '' || url.password !== '') return false;
  return url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === '127.0.0.1');
}

/** `POST /platforms/:platform/connection` (201): where to send the browser, and until when the `state` lives. */
export const ConnectionStartViewSchema = z
  .object({
    authorizeUrl: z.string().max(4096).refine(isAllowedAuthorizeUrl, { message: 'authorizeUrl must be https or the loopback callback' }),
    expiresAt: IsoDateTimeSchema,
  })
  .strict();
export type ConnectionStartView = z.infer<typeof ConnectionStartViewSchema>;

/**
 * `GET /platforms/:platform/connection/callback` query, after `pickConnectionCallbackQuery`. The
 * values are never logged (K7). A present `error` refuses the connect with `oauth-denied`.
 */
export const ConnectionCallbackQuerySchema = z
  .object({
    code: z.string().min(1).max(2048).regex(/^[\x21-\x7E]+$/).optional(),
    state: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/).optional(),
    error: z.string().min(1).max(200).optional(),
  })
  .strict();
export type ConnectionCallbackQuery = z.infer<typeof ConnectionCallbackQuerySchema>;

const callbackQueryKeys = ['code', 'state', 'error'] as const;

/**
 * Platforms add parameters of their own to the redirect (`scope`, `authuser`, `error_description`,
 * ...). Only the three the flow uses are kept, as an allowlist, before the strict schema runs; a
 * repeated parameter (an array) is kept as is so the schema refuses it.
 */
export function pickConnectionCallbackQuery(query: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const key of callbackQueryKeys) {
    if (Object.hasOwn(query, key)) picked[key] = query[key];
  }
  return picked;
}

/** The web page the callback answers 303 to (section 4.4). */
export const CONNECTION_RESULT_PAGE_PATH = '/contas';

/** `resultado` on `/contas` after the callback. */
export const ConnectionResultSchema = z.enum(['conectada', 'falhou']);
export type ConnectionResult = z.infer<typeof ConnectionResultSchema>;

/** The query of `/contas` after a callback; the web shows the reason's pt-BR text, never platform text. */
export const ConnectionResultQuerySchema = z
  .object({ resultado: ConnectionResultSchema, motivo: ApiRev7ErrorReasonSchema.optional() })
  .strict();
export type ConnectionResultQuery = z.infer<typeof ConnectionResultQuerySchema>;

/** `/contas?resultado=<conectada | falhou>[&motivo=<reason id>]`, relative to the web origin. */
export function connectionResultPagePath(query: ConnectionResultQuery): string {
  const search = new URLSearchParams({ resultado: query.resultado });
  if (query.motivo !== undefined) search.set('motivo', query.motivo);
  return `${CONNECTION_RESULT_PAGE_PATH}?${search.toString()}`;
}

/** A redirect URI input outside the contract: a port outside 1-65535 or an unknown platform. */
export class ConnectionRedirectInvalidError extends Error {
  constructor(readonly field: 'apiPort' | 'platform') {
    super(`connection redirect URI: invalid ${field}`);
    this.name = 'ConnectionRedirectInvalidError';
  }
}

/**
 * The exact OAuth `redirect_uri` (section 5.2, AC 39):
 * `http://127.0.0.1:<api port>/platforms/<platform>/connection/callback`. Platforms match it
 * character for character, so the api, the mock clients and the owner's registration (B3) all
 * build it here.
 */
export function connectionRedirectUri(options: { apiPort: number; platform: Platform }): string {
  if (!Number.isInteger(options.apiPort) || options.apiPort < 1 || options.apiPort > 65_535) {
    throw new ConnectionRedirectInvalidError('apiPort');
  }
  if (!PlatformSchema.safeParse(options.platform).success) throw new ConnectionRedirectInvalidError('platform');
  return `http://127.0.0.1:${options.apiPort}${apiPaths.platformConnectionCallback(options.platform)}`;
}
