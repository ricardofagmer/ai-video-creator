import { type CostLedgerPort, type UsageQuantity } from '@studio/shared/ports';
import { type ModelId } from '@studio/shared/run-format';
import { toModelCallUsage, toUsageQuantity } from '../usage/model-usage.mapper';
import { ReferenceAnalystMeterError, type ReferenceAnalystMeterFailure } from './reference-analyst.errors';

/** What the analyst needs of the cost ledger: the price table only; recording is the watcher's. */
export type ReferenceAnalystPricing = Pick<CostLedgerPort, 'priceUsd'>;

/** The one billed request of an analyst call. */
export interface BilledAnalystRequest {
  readonly usage: UsageQuantity;
  readonly usd: number;
}

/** Hooks the model client runs: before a request leaves, after it returned. */
export interface ReferenceAnalystCallHooks {
  beforeModelCall(): Promise<void>;
  afterModelCall(step: unknown): void;
}

/**
 * Meters the single model request of one `analyse`. A second billed request is refused before it
 * is sent. A 429 never reaches `afterModelCall`, so rate-limit retries do not count. A failure
 * recorded from inside the model loop aborts `signal`, which is part of the call's combined signal,
 * because Mastra callbacks cannot be relied on to propagate a thrown error.
 */
export class ReferenceAnalystMeter implements ReferenceAnalystCallHooks {
  private readonly controller = new AbortController();
  private recorded: ReferenceAnalystMeterFailure | null = null;
  private billed: BilledAnalystRequest | null = null;
  private requestSent = false;

  constructor(
    private readonly modelId: ModelId,
    private readonly pricing: ReferenceAnalystPricing,
  ) {}

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get failure(): ReferenceAnalystMeterFailure | null {
    return this.recorded;
  }

  get billedRequest(): BilledAnalystRequest | null {
    return this.billed;
  }

  /** A request left but no usage came back for it: the provider may still have billed it. */
  get sentWithoutUsage(): boolean {
    return this.requestSent && this.billed === null;
  }

  async beforeModelCall(): Promise<void> {
    if (this.recorded !== null) throw new ReferenceAnalystMeterError(this.recorded);
    if (this.billed !== null) throw this.fail('second-model-call');
    this.requestSent = true;
  }

  afterModelCall(step: unknown): void {
    const usage = toModelCallUsage(step);
    if (usage === null) {
      this.fail('usage-unreadable');
      return;
    }
    const quantity = toUsageQuantity(this.modelId, usage);
    try {
      this.billed = { usage: quantity, usd: this.pricing.priceUsd(quantity) };
    } catch {
      this.fail('model-unpriced');
    }
  }

  /** Records the first failure and stops the call; later failures are consequences of it. */
  private fail(failure: ReferenceAnalystMeterFailure): ReferenceAnalystMeterError {
    if (this.recorded === null) {
      this.recorded = failure;
      this.controller.abort(new ReferenceAnalystMeterError(failure));
    }
    return new ReferenceAnalystMeterError(this.recorded);
  }
}
