import { InvalidPlatformInputError, PlatformError } from '@studio/core/platforms';
import {
  ApiRev7ErrorReasonSchema,
  ConnectionCallbackQuerySchema,
  connectionResultPagePath,
  pickConnectionCallbackQuery,
  type ApiRev7ErrorReason,
  type ConnectionCallbackQuery,
  type ConnectionResult,
} from '@studio/shared/api';

/** What Nest's `@Redirect()` sends: `Location` and the status. */
export interface CallbackRedirect {
  url: string;
  statusCode: number;
}

/** Section 4.4: the callback always answers 303 to the web's `/contas`. */
const SEE_OTHER = 303;

/**
 * The platform's redirect query, allowlisted to `code`, `state` and `error` and then checked with
 * the strict C10 schema; null when it does not match (a repeated parameter, a malformed `state`).
 * The values are never logged (K7).
 */
export function callbackQueryOf(query: Readonly<Record<string, unknown>>): ConnectionCallbackQuery | null {
  const parsed = ConnectionCallbackQuerySchema.safeParse(pickConnectionCallbackQuery(query));
  return parsed.success ? parsed.data : null;
}

/**
 * The reason id the web shows for a failed callback. A rev 7 refusal keeps its reason; malformed
 * input reads as `oauth-state-invalid` (a callback the flow did not produce); anything else
 * carries no reason, so no internal detail and no platform text reaches the address bar.
 */
export function callbackReasonOf(error: unknown): ApiRev7ErrorReason | null {
  if (error instanceof InvalidPlatformInputError) return 'oauth-state-invalid';
  if (!(error instanceof PlatformError)) return null;
  const reason = ApiRev7ErrorReasonSchema.safeParse(error.reason);
  return reason.success ? reason.data : null;
}

/**
 * `<web origin>/contas?resultado=<conectada | falhou>[&motivo=<reason id>]`: a reason id only,
 * never a code, a `state`, an account label or a platform's own text (section 6 "Callback").
 */
export function callbackRedirect(options: { webOrigin: string; result: ConnectionResult; reason: ApiRev7ErrorReason | null }): CallbackRedirect {
  const path = connectionResultPagePath(
    options.reason === null ? { resultado: options.result } : { resultado: options.result, motivo: options.reason },
  );
  return { url: new URL(path, options.webOrigin).toString(), statusCode: SEE_OTHER };
}
