import { Injectable, Logger } from '@nestjs/common';
import { AssetJobCostSessionSchema, type AssetJobKind } from '@studio/shared/asset-jobs';
import { readAssetJobCost, writeAssetJobCost, type AssetJobLocation } from '@studio/shared/asset-jobs/files';
import { type AssetRef } from '@studio/shared/catalog';
import { type AssetJobCostPort, type AssetJobCostRecordRequest, type UsageQuantity } from '@studio/shared/ports';
import { COST_SUM_TOLERANCE_USD, defaultLimits } from '@studio/shared/run-format';
import { appendAssetJobCostSession } from '../costs/asset-job-cost-file';
import { assetJobCostUsageOf } from '../costs/asset-job-cost.mapper';
import { CostLedgerService } from '../costs/cost-ledger.service';
import { AssetJobCostUsageUnsupportedError, CostSessionPriceMismatchError } from '../costs/costs.errors';
import { PRICE_TABLE } from '../costs/price-table';
import { DataHome } from '../paths/data-home';

/**
 * C6 `AssetJobCostPort` (spec Amendment 3), bound by the watcher. `record` writes only
 * `asset-jobs/<kind>/<ref>/cost.json` through the shared helper and never SQLite (ADR 0003); the
 * api and the CLI index the file with `IndexAssetJobCostCommand`, exactly as for curations.
 * Pricing and the month spend are `CostLedgerService`'s, so a mock provider costs $0 and an
 * unreadable spend throws (the caller refuses the job: fails closed). `monthToDateUsd` also counts
 * cost.json sessions the api has not indexed yet. The month ceiling is the owner's monthly limit.
 */
@Injectable()
export class AssetJobCostService implements AssetJobCostPort {
  private readonly logger = new Logger(AssetJobCostService.name);
  private readonly jobQueues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly dataHome: DataHome,
    private readonly ledger: CostLedgerService,
  ) {}

  /** Throws `PriceNotAvailableError` for live usage the table cannot price (fails closed). */
  priceUsd(usage: UsageQuantity): number {
    return this.ledger.priceUsd(usage);
  }

  /**
   * Appends one billed call to the job's cost.json. Recording the same `sessionId` with the same
   * values again is a no-op, so a retried write never bills twice; other values are a
   * `CostSessionConflictError`. A full file throws `AssetJobCostSessionsFullError`.
   */
  async record(request: AssetJobCostRecordRequest): Promise<void> {
    const usage = assetJobCostUsageOf(request.usage);
    if (usage === null) throw new AssetJobCostUsageUnsupportedError(request.ref, request.usage.kind);
    // The USD written to cost.json must be the price table's, whoever computed it upstream.
    const expectedUsd = this.priceUsd(request.usage);
    if (Math.abs(expectedUsd - request.usd) > COST_SUM_TOLERANCE_USD) throw new CostSessionPriceMismatchError(request.sessionId, 1);
    const session = AssetJobCostSessionSchema.parse({
      sessionId: request.sessionId,
      usage,
      usd: request.usd,
      occurredAt: request.occurredAt.toISOString(),
      priceTableVersion: PRICE_TABLE.version,
    });
    const location = this.locationOf(request.kind, request.ref);

    await this.serializedPerJob(location, async () => {
      const existing = await readAssetJobCost(location);
      const result = appendAssetJobCostSession({
        existing: existing.status === 'present' ? existing.value : null,
        kind: request.kind,
        ref: request.ref,
        priceTableVersion: PRICE_TABLE.version,
        session,
        now: new Date(),
      });
      if (result.outcome === 'appended') await writeAssetJobCost(location, result.file);
      this.logger.log({
        event: 'asset-job.cost-recorded',
        kind: request.kind,
        ref: request.ref,
        sessionId: request.sessionId,
        usd: request.usd,
        jobTotalUsd: result.file.totalUsd,
        sessions: result.file.sessions.length,
        outcome: result.outcome,
      });
    });
  }

  monthToDateUsd(at: Date): Promise<number> {
    return this.ledger.monthToDateUsd(at);
  }

  monthCeilingUsd(): Promise<number> {
    return Promise.resolve(defaultLimits.costPerMonthUsd);
  }

  private locationOf(kind: AssetJobKind, ref: AssetRef): AssetJobLocation {
    return { assetJobsRoot: this.dataHome.assetJobs, kind, ref };
  }

  /** cost.json is read-modify-written; two calls of one job must not interleave. */
  private async serializedPerJob<T>(location: AssetJobLocation, work: () => Promise<T>): Promise<T> {
    const queueKey = `${location.kind}/${location.ref}`;
    const previous = this.jobQueues.get(queueKey) ?? Promise.resolve();
    // The previous call's failure was already delivered to its own caller.
    const current = previous.catch(() => undefined).then(work);
    this.jobQueues.set(queueKey, current);
    try {
      return await current;
    } finally {
      if (this.jobQueues.get(queueKey) === current) this.jobQueues.delete(queueKey);
    }
  }
}
