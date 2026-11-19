import type { CostLedgerPort, CostRecordRequest, CostRecordResult } from '@studio/shared/ports';
import { readCostFile, writeCostFile } from '@studio/shared/run-files';
import { sumSessionUsd, type CostFile, type RunId } from '@studio/shared/run-format';
import { type Clock } from '../engine/clock';

const MOCK_PRICE_TABLE_VERSION = 'mock-0';

/**
 * Cost ledger for mock mode: every quantity prices at zero, so a mocked run spends $0 (topology
 * section 11), while cost.json still lists every session the mocks recorded. R1-11 binds the
 * priced ledger to `COST_LEDGER` instead.
 */
export class MockCostLedger implements CostLedgerPort {
  readonly priceTableVersion = MOCK_PRICE_TABLE_VERSION;
  private monthSpendUsd = 0;

  constructor(private readonly clock: Clock) {}

  priceUsd(): number {
    return 0;
  }

  async record(request: CostRecordRequest): Promise<CostRecordResult> {
    const current = await this.costFileOf(request.runDir, request.runId);
    const sessions = [...current.sessions, request.session];
    const next: CostFile = {
      ...current,
      updatedAt: this.clock.now().toISOString(),
      sessions,
      totalUsd: sumSessionUsd(sessions),
    };
    await writeCostFile(request.runDir, next);
    this.monthSpendUsd += request.session.usd;
    return { runTotalUsd: next.totalUsd, monthToDateUsd: this.monthSpendUsd };
  }

  async monthToDateUsd(): Promise<number> {
    return this.monthSpendUsd;
  }

  /** Writes an empty cost.json when no session was recorded yet (K5 needs the file at review). */
  async ensureCostFile(runDir: string, runId: RunId): Promise<void> {
    const existing = await readCostFile(runDir);
    if (existing.status === 'absent') await writeCostFile(runDir, await this.costFileOf(runDir, runId));
  }

  private async costFileOf(runDir: string, runId: RunId): Promise<CostFile> {
    const existing = await readCostFile(runDir);
    if (existing.status === 'present') return existing.value;
    return {
      format: 1,
      runId,
      currency: 'USD',
      priceTableVersion: this.priceTableVersion,
      updatedAt: this.clock.now().toISOString(),
      sessions: [],
      totalUsd: 0,
    };
  }
}
