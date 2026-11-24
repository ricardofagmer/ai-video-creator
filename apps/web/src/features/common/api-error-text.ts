import { type ApiRev5ErrorReason } from '@studio/shared/api';
import { ApiRequestContractError, ApiRequestError, ApiResponseContractError, ApiUnreachableError } from '@/lib/api';
import { type WebMessages } from '@/messages';

/** design/telas/01, "Api fora do ar", in the active language. */
export function apiUnreachableText(t: WebMessages): string {
  return t.common.apiErrors.unreachable;
}

/*
 * Every known `reason` of one language in one lookup: the C10 reasons of the catalog and recipe
 * screens plus the rev 5 reasons (SPEC 0006 section 4.4). The api's own `message` is English and is
 * never shown; an unknown reason falls back to its status and id. Built once per language.
 */
const reasonLookups = new WeakMap<WebMessages, ReadonlyMap<string, string>>();

function reasonLookupOf(t: WebMessages): ReadonlyMap<string, string> {
  const cached = reasonLookups.get(t);
  if (cached !== undefined) return cached;
  const lookup = new Map<string, string>([
    ...Object.entries(t.common.apiErrors.reasons),
    ...Object.entries(t.common.apiErrors.rev5Reasons),
    ...Object.entries(t.common.apiErrors.guidedReasons),
  ]);
  reasonLookups.set(t, lookup);
  return lookup;
}

/** The text of one contract reason, for a check the browser makes before calling the api. */
export function apiReasonText(reason: ApiRev5ErrorReason, t: WebMessages): string {
  const texts: Readonly<Record<ApiRev5ErrorReason, string>> = t.common.apiErrors.rev5Reasons;
  return texts[reason];
}

/** One sentence in the active language for any failure of a C10 call. */
export function describeApiError(error: unknown, t: WebMessages): string {
  const texts = t.common.apiErrors;
  if (error instanceof ApiUnreachableError) return texts.unreachable;
  if (error instanceof ApiRequestContractError) return texts.requestContract;
  if (error instanceof ApiResponseContractError) return texts.responseContract;
  if (error instanceof ApiRequestError) {
    const known = error.reason === null ? undefined : reasonLookupOf(t).get(error.reason);
    if (known !== undefined) return known;
    if (error.status === 413) return texts.contentTooLarge;
    if (error.status >= 500) return texts.unreachable;
    return texts.status(error.status, error.reason);
  }
  return texts.unexpected;
}
