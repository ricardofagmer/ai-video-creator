import { REDACTED_PLACEHOLDER } from '@studio/shared/agents';
import { clip } from '../text';
import { type StepFailure } from '../seams';

/** RecoveryPacket `failureReason` and RecoveryRecord `error` cap (C7, C3). */
const FAILURE_TEXT_MAX = 2000;

/**
 * Defence in depth before a failure reason reaches the Recovery model or run.json (topology
 * section 8). Executors already redact their messages (C6); this pass removes what must never
 * leave the machine even if one did not: absolute paths (a biometric reference path among them)
 * and token-shaped strings. R1-11's redaction module supersedes it when the engine can depend on it.
 */
const redactionPatterns: readonly RegExp[] = [
  /(?:~\/|(?<![\w.])\/)[^\s"'<>]+/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\bsk-[A-Za-z0-9_-]{12,}/g,
  /\b[A-Za-z0-9+/_-]{40,}\b/g,
];

export function redactFailureText(text: string): string {
  return redactionPatterns.reduce((redacted, pattern) => redacted.replace(pattern, REDACTED_PLACEHOLDER), text);
}

function rawFailureText(failure: StepFailure): string {
  switch (failure.origin) {
    case 'executor':
      return failure.failure.message;
    case 'postcondition':
      return `${failure.postcondition}: ${failure.detail}`;
    case 'checks':
      return `${failure.postcondition}: ${failure.detail}`;
    case 'guard':
      return failure.reason;
  }
}

/**
 * The redacted, clipped text of a failure. It is also the error identity of PRD 7.3 "the same
 * error after a recovery ends the attempts": two failures are the same error when this text is.
 */
export function failureText(failure: StepFailure): string {
  return clip(redactFailureText(rawFailureText(failure)), FAILURE_TEXT_MAX);
}
