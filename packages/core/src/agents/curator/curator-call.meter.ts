import { type ModelId } from '@studio/shared/run-format';
import { toModelCallUsage, toUsageQuantity, type ModelCallUsage } from '../usage/model-usage.mapper';
import { CuratorCallError, type CuratorCallFailure } from './curator-call.error';
import { type CuratorPricing } from './curator.tokens';

/** The one billed request of a Curator call: usage, price and wall-clock span. */
export interface BilledCuratorRequest {
  readonly usage: ModelCallUsage;
  readonly usd: number;
  readonly startedAt: Date;
  readonly endedAt: Date;
}

/** Per-request hooks the model client runs: before a request leaves, after it returned. */
export interface CuratorCallHooks {
  beforeModelCall(): Promise<void>;
  afterModelCall(step: unknown): void;
}

/**
 * Meters the single model request of one Curator call (SPEC 0005 section 5.5, B6). A second
 * billed request is refused before it is sent: one `call` is one model call. Rate-limit retries
 * do not count, because a 429 never reaches `afterModelCall`. A failure recorded from inside the
 * model loop aborts `signal`, which is part of the call's combined signal (Mastra callbacks cannot
 * be relied on to propagate a thrown error).
 */
export class CuratorCallMeter implements CuratorCallHooks {
  private readonly controller = new AbortController();
  private recorded: CuratorCallFailure | null = null;
  private billed: BilledCuratorRequest | null = null;
  private requestStartedAt: Date | null = null;

  constructor(
    private readonly modelId: ModelId,
    private readonly pricing: CuratorPricing,
  ) {}

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get failure(): CuratorCallFailure | null {
    return this.recorded;
  }

  get billedRequest(): BilledCuratorRequest | null {
    return this.billed;
  }

  /**
   * The instant a request left when no usage came back for it (call timeout, curation timeout,
   * stop, unreadable usage); null when no request was sent or it was billed. Such a request may
   * still have been billed by the provider, so the agent records an estimate for it (C5-AC-16).
   */
  get unbilledRequestStartedAt(): Date | null {
    return this.billed === null ? this.requestStartedAt : null;
  }

  async beforeModelCall(): Promise<void> {
    if (this.recorded !== null) throw new CuratorCallError(this.recorded);
    if (this.billed !== null) throw this.fail({ kind: 'second-model-call' });
    this.requestStartedAt = new Date();
  }

  afterModelCall(step: unknown): void {
    const usage = toModelCallUsage(step);
    if (usage === null) {
      this.fail({ kind: 'trace-failed', target: 'usage' });
      return;
    }
    let usd: number;
    try {
      usd = this.pricing.priceUsd(toUsageQuantity(this.modelId, usage));
    } catch {
      this.fail({ kind: 'configuration', reason: 'model-unpriced' });
      return;
    }
    const endedAt = new Date();
    this.billed = { usage, usd, startedAt: this.requestStartedAt ?? endedAt, endedAt };
  }

  /** Records the first failure and stops the call; later failures are consequences of it. */
  private fail(failure: CuratorCallFailure): CuratorCallError {
    if (this.recorded === null) {
      this.recorded = failure;
      this.controller.abort(new CuratorCallError(failure));
    }
    return new CuratorCallError(this.recorded);
  }
}
