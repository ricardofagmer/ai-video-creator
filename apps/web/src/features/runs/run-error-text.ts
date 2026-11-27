import { describeApiError } from '@/features/common/api-error-text';
import { ApiRequestError } from '@/lib/api';
import { type WebMessages } from '@/messages';

type RunReason = keyof WebMessages['runs']['errors'];

function isRunReason(reason: string, t: WebMessages): reason is RunReason {
  return reason in t.runs.errors;
}

/**
 * One sentence for any failure of a runs or review C10 call. The C10 error `reason`s the runs and
 * review screens meet have their own texts (`t.runs.errors`); the api's English `message` is never
 * shown, and anything else falls back to the shared api error texts.
 */
export function describeRunError(error: unknown, t: WebMessages): string {
  if (error instanceof ApiRequestError && error.reason !== null && isRunReason(error.reason, t)) {
    const known = t.runs.errors[error.reason];
    if (known !== undefined) return known;
  }
  return describeApiError(error, t);
}

/** The events log was rewritten under the reader; it is read again from byte 0 (C5). */
export function isEventLogReset(error: unknown): boolean {
  return error instanceof ApiRequestError && error.reason === 'run-file-append-only-violated';
}

/** A fetch aborted by its own AbortController (tab hidden, page left): not a failure. */
export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
