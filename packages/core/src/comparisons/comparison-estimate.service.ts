import { Injectable, Logger } from '@nestjs/common';
import { type ComparisonEstimate } from '@studio/shared/api';
import { type RunFile } from '@studio/shared/run-format';
import { CostLedgerService } from '../costs';
import { ProviderModeService } from '../providers';
import { EXPECTED_COST_SAMPLE_RUNS, PAID_PROVIDERS, buildComparisonEstimate } from './comparison-estimate';
import { ComparisonRepository } from './comparison.repository';

/**
 * The estimate service (section 5.3, B20): reads the month-to-date spend from the R1 cost ledger,
 * the provider modes and the recipe's reviewed run costs, and builds the D11 figures from the
 * limits frozen in both run.json files. Read-only; it never writes a ledger or a run file.
 */
@Injectable()
export class ComparisonEstimateService {
  private readonly logger = new Logger(ComparisonEstimateService.name);

  constructor(
    private readonly ledger: CostLedgerService,
    private readonly modes: ProviderModeService,
    private readonly comparisons: ComparisonRepository,
  ) {}

  /**
   * `CostLedgerService.monthToDateUsd` (the rev 4 source of `monthSpendUsd`), or null when it is
   * unavailable for any reason. Null is never treated as zero: the gate refuses on it.
   */
  async monthToDateUsd(at: Date): Promise<number | null> {
    try {
      const spent = await this.ledger.monthToDateUsd(at);
      return Number.isFinite(spent) && spent >= 0 ? spent : null;
    } catch (error) {
      // The error name only: a month-to-date failure message may name a run folder.
      this.logger.warn({ event: 'comparisons.month-spend-unavailable', errorName: error instanceof Error ? error.name : 'unknown' });
      return null;
    }
  }

  /** Builds the estimate for a pair; `monthToDateUsd` is read once per request by the caller. */
  async estimate(pair: { a: RunFile; b: RunFile }, monthToDateUsd: number | null): Promise<ComparisonEstimate> {
    const recentReviewedRunCostsUsd = await this.comparisons.recentReviewedPaidRunCosts(
      pair.a.recipe.definition.id,
      EXPECTED_COST_SAMPLE_RUNS,
    );
    return buildComparisonEstimate({
      limits: { a: pair.a.limits, b: pair.b.limits },
      paidProviderLive: PAID_PROVIDERS.some((provider) => this.modes.isLive(provider)),
      monthToDateUsd,
      recentReviewedRunCostsUsd,
    });
  }
}
