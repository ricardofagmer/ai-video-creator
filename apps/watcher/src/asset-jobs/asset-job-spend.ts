import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AssetJobLocation } from '@studio/shared/asset-jobs/files';
import { type AssetJobCostPort, type UsageQuantity } from '@studio/shared/ports';
import { type SessionId } from '@studio/shared/run-format';
import { type Clock } from '../engine/clock';
import { errorName } from '../platform/error-name';
import { type AssetJobRefusedCode } from './asset-job-file.mapper';
import { ASSET_JOB_COST, ASSET_JOBS_CLOCK } from './asset-jobs.tokens';

/** One billed call as the job's cost.json records it. */
export interface BilledCall {
  sessionId: SessionId;
  usage: UsageQuantity;
  usd: number;
}

/**
 * The asset-job spend gate and cost recorder (spec sections 1 and Amendment 3), both through
 * `AssetJobCostPort`. The gate fails closed: an unreadable month spend or ceiling refuses the job
 * with `month-spend-unavailable`, a worst case that would pass the ceiling with `month-ceiling`.
 * Logs carry refs, kinds, codes and amounts only.
 */
@Injectable()
export class AssetJobSpend {
  private readonly logger = new Logger(AssetJobSpend.name);

  constructor(
    @Inject(ASSET_JOB_COST) private readonly cost: AssetJobCostPort,
    @Inject(ASSET_JOBS_CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * The price table's price of `usage`; null when it cannot be priced, which the caller treats as
   * a refusal (no billed call on an unknown price). 0 in mock mode or under Claude Code.
   */
  priceOf(location: AssetJobLocation, usage: UsageQuantity): number | null {
    try {
      return this.cost.priceUsd(usage);
    } catch (error) {
      this.logger.warn({ event: 'asset-job.price-unavailable', kind: location.kind, ref: location.ref, usage: usage.kind, error: errorName(error) });
      return null;
    }
  }

  /** Null when a call that may cost `worstCaseUsd` fits under the month ceiling; the refusal otherwise. */
  async refusalFor(location: AssetJobLocation, worstCaseUsd: number): Promise<AssetJobRefusedCode | null> {
    let monthToDateUsd: number;
    let ceilingUsd: number;
    try {
      monthToDateUsd = await this.cost.monthToDateUsd(this.clock.now());
      ceilingUsd = await this.cost.monthCeilingUsd();
    } catch (error) {
      this.logger.warn({ event: 'asset-job.month-spend-unavailable', kind: location.kind, ref: location.ref, error: errorName(error) });
      return 'month-spend-unavailable';
    }
    if (!Number.isFinite(monthToDateUsd) || !Number.isFinite(ceilingUsd) || !Number.isFinite(worstCaseUsd)) return 'month-spend-unavailable';
    if (monthToDateUsd + worstCaseUsd > ceilingUsd) {
      this.logger.log({ event: 'asset-job.month-ceiling', kind: location.kind, ref: location.ref, monthToDateUsd, worstCaseUsd, ceilingUsd });
      return 'month-ceiling';
    }
    return null;
  }

  /**
   * Records one billed call before the job's result is written. Never throws: the call already
   * happened and was billed, so a failed record must not lead to the job being run (and billed)
   * again. It is logged loudly instead, as an error naming the ref, the session and the amount, so
   * the spend can be reconciled by hand; the caller still writes the job's ending. True when
   * recorded.
   */
  async record(location: AssetJobLocation, call: BilledCall): Promise<boolean> {
    try {
      await this.cost.record({ ref: location.ref, kind: location.kind, sessionId: call.sessionId, usage: call.usage, usd: call.usd, occurredAt: this.clock.now() });
      return true;
    } catch (error) {
      this.logger.error({
        event: 'asset-job.cost-record-failed',
        kind: location.kind,
        ref: location.ref,
        sessionId: call.sessionId,
        usage: call.usage.kind,
        usd: call.usd,
        error: errorName(error),
      });
      return false;
    }
  }
}
