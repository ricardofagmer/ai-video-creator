import { type UsageQuantity } from '@studio/shared/ports';
import { type SessionId } from '@studio/shared/run-format';

/**
 * Every way `ReferenceAnalystService.analyse` fails outside the port's result union. Timeouts,
 * provider errors, rate limits, refused credentials and invalid answers are results; these are not:
 * - `invalid-request`: the frames or the duration broke `referenceAnalysisBounds` or are not JPEG;
 * - `cancelled`: the caller's signal (watcher stop) fired first;
 * - `redaction-failed`: the name or notes could not be redacted, so nothing was sent;
 * - `model-unpriced`: live mode with a model the price table does not know, so nothing was sent.
 */
export type ReferenceAnalystFailureKind = 'invalid-request' | 'cancelled' | 'redaction-failed' | 'model-unpriced';

/** What a call had already used when it failed; the caller still records a billed spend. */
export interface ReferenceAnalystErrorContext {
  readonly sessionId: SessionId | null;
  readonly usage: UsageQuantity | null;
  readonly usd: number;
}

const NO_CALL: ReferenceAnalystErrorContext = { sessionId: null, usage: null, usd: 0 };

/**
 * The only error `analyse` rejects with. The message holds the kind only and `cause` is never
 * set, so no frame, name, note, model or provider text can travel with it.
 */
export class ReferenceAnalystCallError extends Error {
  constructor(
    readonly kind: ReferenceAnalystFailureKind,
    readonly context: ReferenceAnalystErrorContext = NO_CALL,
  ) {
    super(`Reference analyst call failed: ${kind}`);
    this.name = 'ReferenceAnalystCallError';
  }
}

/** Failures the meter records from inside the model loop; they end the call as `provider-error`. */
export type ReferenceAnalystMeterFailure = 'second-model-call' | 'usage-unreadable' | 'model-unpriced';

/** Thrown inside the model loop by the meter; the service maps it, it never leaves `analyse`. */
export class ReferenceAnalystMeterError extends Error {
  constructor(readonly failure: ReferenceAnalystMeterFailure) {
    super(`Reference analyst meter stopped the call: ${failure}`);
    this.name = 'ReferenceAnalystMeterError';
  }
}
