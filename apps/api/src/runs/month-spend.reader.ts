import { Injectable, Logger } from '@nestjs/common';
import { CostLedgerService, MonthToDateUnavailableError } from '@studio/core/costs';

/** A21: a computed value may be reused for at most 5 s; the run page polls every 1 s. */
const REUSE_MS = 5000;

interface ComputedSpend {
  value: number | null;
  computedAtMs: number;
}

/**
 * `RunStateResponse.monthSpendUsd` (SPEC 0002 rev 4, A21): core month-to-date spend through its
 * exported entry `CostLedgerService.monthToDateUsd`, for the server clock. `null` when it cannot be
 * computed, never 0, and the run route still answers 200. Display data only: the cost ceiling is
 * enforced by the watcher at `preflight`, not here.
 */
@Injectable()
export class MonthSpendReader {
  private readonly logger = new Logger(MonthSpendReader.name);
  private last: ComputedSpend | null = null;
  private inFlight: Promise<number | null> | null = null;

  constructor(private readonly ledger: CostLedgerService) {}

  async read(): Promise<number | null> {
    const nowMs = Date.now();
    const last = this.last;
    // Reused only inside the window and the same calendar month, so a month boundary is never stale.
    if (last !== null && nowMs - last.computedAtMs < REUSE_MS && sameMonth(last.computedAtMs, nowMs)) return last.value;
    // Concurrent polls share one computation: it scans every run folder.
    this.inFlight ??= this.compute(nowMs).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async compute(nowMs: number): Promise<number | null> {
    const value = await this.ledger.monthToDateUsd(new Date(nowMs)).catch((error: unknown) => this.unavailable(error));
    this.last = { value, computedAtMs: nowMs };
    return value;
  }

  /**
   * `MonthToDateUnavailableError` is the documented case (A21). Any other failure also yields
   * `null` rather than failing the run page over a meter; it is logged by name as unexpected.
   */
  private unavailable(error: unknown): null {
    if (error instanceof MonthToDateUnavailableError) {
      this.logger.warn({ event: 'costs.month-spend-unavailable', reason: error.reason, runId: error.runId });
    } else {
      this.logger.error({ event: 'costs.month-spend-failed', errorName: error instanceof Error ? error.name.slice(0, 80) : 'unknown' });
    }
    return null;
  }
}

function sameMonth(firstMs: number, secondMs: number): boolean {
  const first = new Date(firstMs);
  const second = new Date(secondMs);
  return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth();
}
