import { type SessionId } from '@studio/shared/run-format';

/** Trace or ledger writes that must succeed for a Curator call to count (topology 0004 section 10). */
export type CuratorTraceTarget = 'session-stream' | 'cost-ledger' | 'usage';

/**
 * Every way `CuratorAgentService.call` fails outside the C6 `CuratorCallResult` union. Timeouts of
 * the call itself, provider errors and rate limits are results, not errors; these are not:
 * - `invalid-request`: packet, correction or folder did not pass their strict schemas;
 * - `cancelled`: the caller's signal (the 300 s curation timeout or a watcher stop) fired first;
 * - `second-model-call`: the model loop tried a second billed request, which was refused;
 * - the rest are wiring or trace failures that fail the call closed.
 */
export type CuratorCallFailure =
  | { kind: 'invalid-request' }
  | { kind: 'cancelled' }
  | { kind: 'redaction-failed' }
  | { kind: 'second-model-call' }
  | { kind: 'configuration'; reason: 'model-unpriced' }
  | { kind: 'trace-failed'; target: CuratorTraceTarget }
  | { kind: 'internal' };

/** Short English label for logs; never model, packet or provider text. */
export function describeCuratorFailure(failure: CuratorCallFailure): string {
  switch (failure.kind) {
    case 'configuration':
      return `configuration (${failure.reason})`;
    case 'trace-failed':
      return `trace-failed (${failure.target})`;
    case 'invalid-request':
    case 'cancelled':
    case 'redaction-failed':
    case 'second-model-call':
    case 'internal':
      return failure.kind;
  }
}

export interface CuratorCallErrorContext {
  /** Null when the call failed before its session started. */
  readonly sessionId: SessionId | null;
  /** What the call billed before it failed (0 in mock mode or before any billed request). */
  readonly usd: number;
}

const NO_CALL: CuratorCallErrorContext = { sessionId: null, usd: 0 };

/**
 * The only error `CuratorAgentService.call` rejects with. The message holds the failure kind only;
 * `cause` is never set, so no packet, model or provider text can travel with it. `usd` is what was
 * already billed, so the caller can still count the spend toward the $1.00 bound.
 */
export class CuratorCallError extends Error {
  constructor(
    readonly failure: CuratorCallFailure,
    readonly context: CuratorCallErrorContext = NO_CALL,
  ) {
    super(`Curator call failed: ${describeCuratorFailure(failure)}`);
    this.name = 'CuratorCallError';
  }
}
