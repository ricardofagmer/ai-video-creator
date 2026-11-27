import { type UsageQuantity } from '@studio/shared/ports';
import { type SessionId } from '@studio/shared/run-format';

/**
 * Every way `AssetPurposeWriterService.write` fails outside the port's result union. Timeouts,
 * provider errors, rate limits, refused credentials and invalid answers are results; these are not:
 * - `cancelled`: the caller's signal (watcher stop) fired first;
 * - `redaction-failed`: the catalog text could not be redacted, so nothing was sent;
 * - `model-unpriced`: live mode with a model the price table does not know, so nothing was sent.
 */
export type AssetPurposeWriterFailureKind = 'cancelled' | 'redaction-failed' | 'model-unpriced';

/** What a call had already used when it failed; the caller still records a billed spend. */
export interface AssetPurposeWriterErrorContext {
  readonly sessionId: SessionId | null;
  readonly usage: UsageQuantity | null;
  readonly usd: number;
}

const NO_CALL: AssetPurposeWriterErrorContext = { sessionId: null, usage: null, usd: 0 };

/**
 * The only error `write` rejects with. The message holds the kind only and `cause` is never set,
 * so no catalog, model or provider text can travel with it.
 */
export class AssetPurposeWriterCallError extends Error {
  constructor(
    readonly kind: AssetPurposeWriterFailureKind,
    readonly context: AssetPurposeWriterErrorContext = NO_CALL,
  ) {
    super(`Asset purpose writer call failed: ${kind}`);
    this.name = 'AssetPurposeWriterCallError';
  }
}
