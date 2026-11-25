import { basename } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import {
  type CostLedgerPort,
  type CostRecordRequest,
  type CostRecordResult,
  type UsageQuantity,
} from '@studio/shared/ports';
import { readCostFile, writeCostFile } from '@studio/shared/run-files';
import { COST_SUM_TOLERANCE_USD, CostSessionSchema, RunIdSchema, type ProviderName } from '@studio/shared/run-format';
import { ProviderModeService } from '../providers/provider-mode.service';
import { appendCostSession } from './cost-file';
import { costSessionKey, usageOfCostSession } from './cost-session.mapper';
import { CostFileRunMismatchError, CostSessionPriceMismatchError } from './costs.errors';
import { MonthToDateSpend } from './month-to-date.service';
import { PRICE_TABLE } from './price-table';
import { priceUsage } from './pricing';

function usageProvider(usage: UsageQuantity): ProviderName {
  if (usage.kind === 'model') return 'claude';
  if (usage.kind === 'tts' || usage.kind === 'music') return usage.provider;
  return 'render';
}

/**
 * C6 `CostLedgerPort` (R1-11), bound by the watcher. It writes cost only to `cost.json` through
 * the C5 helper (SPEC 0002 rev 2; ADR 0003: the watcher never writes SQLite); the api and CLI
 * index cost.json into `cost_entries` with `IndexRunCostCommand`. Mock providers cost nothing
 * (ADR 0002 "Mock by default"); live usage is priced from the versioned price table.
 */
@Injectable()
export class CostLedgerService implements CostLedgerPort {
  readonly priceTableVersion = PRICE_TABLE.version;
  private readonly logger = new Logger(CostLedgerService.name);
  private readonly runQueues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly modes: ProviderModeService,
    private readonly monthToDate: MonthToDateSpend,
  ) {}

  /** Throws `PriceNotAvailableError` for live usage the table cannot price (fails closed). */
  priceUsd(usage: UsageQuantity): number {
    const provider = usageProvider(usage);
    if (!this.modes.isLive(provider)) return 0;
    // ADR 0011: Claude Code calls run on the subscription, which bills nothing per call.
    if (provider === 'claude' && this.modes.usesClaudeCode()) return 0;
    return priceUsage(PRICE_TABLE, usage);
  }

  async record(request: CostRecordRequest): Promise<CostRecordResult> {
    const runId = RunIdSchema.parse(request.runId);
    if (basename(request.runDir) !== runId) throw new CostFileRunMismatchError(runId, basename(request.runDir));
    const session = CostSessionSchema.parse(request.session);
    const key = costSessionKey(session);
    // The USD written to cost.json must be the price table's, whoever computed it upstream.
    const expectedUsd = this.priceUsd(usageOfCostSession(session));
    if (Math.abs(expectedUsd - session.usd) > COST_SUM_TOLERANCE_USD) {
      throw new CostSessionPriceMismatchError(key.sessionId, key.callIndex);
    }

    const runTotalUsd = await this.serializedPerRun(request.runDir, async () => {
      const existing = await readCostFile(request.runDir);
      const result = appendCostSession({
        existing: existing.status === 'present' ? existing.value : null,
        runId,
        priceTableVersion: this.priceTableVersion,
        session,
        now: new Date(),
      });
      if (result.outcome === 'appended') await writeCostFile(request.runDir, result.file);
      this.logger.log({
        event: 'cost.session-recorded',
        runId,
        sessionId: key.sessionId,
        callIndex: key.callIndex,
        kind: session.kind,
        provider: session.provider,
        usd: session.usd,
        runTotalUsd: result.file.totalUsd,
        outcome: result.outcome,
      });
      return result.file.totalUsd;
    });

    return { runTotalUsd, monthToDateUsd: await this.monthToDate.computeUsd(new Date()) };
  }

  monthToDateUsd(at: Date): Promise<number> {
    return this.monthToDate.computeUsd(at);
  }

  /** cost.json is read-modify-written; two sessions of one run must not interleave. */
  private async serializedPerRun<T>(runDir: string, work: () => Promise<T>): Promise<T> {
    const previous = this.runQueues.get(runDir) ?? Promise.resolve();
    // The previous call's failure was already delivered to its own caller.
    const current = previous.catch(() => undefined).then(work);
    this.runQueues.set(runDir, current);
    try {
      return await current;
    } finally {
      if (this.runQueues.get(runDir) === current) this.runQueues.delete(runDir);
    }
  }
}
