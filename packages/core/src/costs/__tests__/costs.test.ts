import 'reflect-metadata';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { newRunId, newSessionId, readCostFile, runDirectory, writeCostFile } from '@studio/shared/run-files';
import { type CostSession } from '@studio/shared/run-format';
import { ProviderModeService } from '../../providers/provider-mode.service';
import { readProviderModeSettings } from '../../providers/provider-modes.config';
import { KeychainReader, type KeychainLookup } from '../../secrets/keychain';
import { SecretsService } from '../../secrets/secrets.service';
import { createCoverageHome, type CoverageHome } from '../../test-support';
import {
  CostFileRunMismatchError,
  CostLedgerService,
  CostSessionPriceMismatchError,
  InvalidCostAmountError,
  MonthToDateUnavailableError,
  PRICE_TABLE,
  checkCostCeilings,
} from '..';
import { CostEntryRepository } from '../cost-entry.repository';
import { CostIndexer } from '../cost-indexer.service';
import { MonthToDateSpend } from '../month-to-date.service';

/*
 * Ticket 07 (costs): the real ceiling check, month-to-date spend, cost indexer and ledger over the
 * coverage temp home. cost.json files are written through the C5 writer as the watcher writes
 * them. Every provider is in mock mode; the Keychain boundary is a fake that is never reached.
 */

/** Never starts the system tool; every key reads as absent. */
class AbsentKeychain extends KeychainReader {
  override read(): Promise<KeychainLookup> {
    return Promise.resolve({ status: 'not-found' });
  }
}

/** Mid-month in local time, so the calendar month is the same in every time zone offset. */
const MID_NOVEMBER = new Date(2026, 10, 15, 12, 0, 0);
const MID_OCTOBER = new Date(2026, 9, 15, 12, 0, 0);

function renderSession(usd: number, at: Date): CostSession {
  return { kind: 'render', sessionId: newSessionId(), stepKey: 'composition:execute:1', provider: 'render', renderSeconds: 30, usd, at: at.toISOString() };
}

interface CostsUnderTest {
  monthToDate: MonthToDateSpend;
  indexer: CostIndexer;
  ledger: CostLedgerService;
}

function costsOf(home: CoverageHome): CostsUnderTest {
  const entries = new CostEntryRepository(home.prisma);
  const monthToDate = new MonthToDateSpend(home.dataHome, entries);
  const modes = new ProviderModeService(readProviderModeSettings({}), new SecretsService(new Map(), new AbsentKeychain()));
  return {
    monthToDate,
    indexer: new CostIndexer(home.prisma, entries, home.dataHome),
    ledger: new CostLedgerService(modes, monthToDate),
  };
}

describe('costs (ticket 07)', () => {
  let home: CoverageHome;
  let costs: CostsUnderTest;

  beforeEach(async () => {
    home = await createCoverageHome({ prefix: 'core-costs', start: new Date('2026-11-21T10:00:00.000Z') });
    costs = costsOf(home);
  });

  afterEach(async () => {
    await home.close();
  });

  /** Writes `runs/<runId>/cost.json` holding `sessions`; returns the run folder. */
  async function costFolder(runId: string, sessions: readonly CostSession[]): Promise<string> {
    const runDir = runDirectory(home.dataHome.runs, runId);
    await writeCostFile(runDir, {
      format: 1,
      runId,
      currency: 'USD',
      priceTableVersion: PRICE_TABLE.version,
      updatedAt: MID_NOVEMBER.toISOString(),
      sessions: [...sessions],
      totalUsd: sessions.reduce((total, session) => total + session.usd, 0),
    });
    return runDir;
  }

  describe('month ceiling and the live run', () => {
    it('does not count the live run spend twice, before or after its cost.json is indexed', async () => {
      const earlierRunId = newRunId();
      const earlierDir = await costFolder(earlierRunId, [renderSession(57, MID_NOVEMBER)]);
      await costs.indexer.indexRun({ runId: earlierRunId, runDir: earlierDir });
      const liveRunId = newRunId();
      const liveDir = await costFolder(liveRunId, [renderSession(2, MID_NOVEMBER)]);

      const beforeIndexing = await costs.monthToDate.computeUsd(MID_NOVEMBER);
      await costs.indexer.indexRun({ runId: liveRunId, runDir: liveDir });
      const afterIndexing = await costs.monthToDate.computeUsd(MID_NOVEMBER);
      const decision = checkCostCeilings({
        limits: { costPerRunUsd: 3, costPerMonthUsd: 60 },
        runSpentUsd: 2,
        estimateUsd: 0.5,
        monthToDateUsd: afterIndexing,
      });

      assert.equal(beforeIndexing, 59);
      assert.equal(afterIndexing, 59);
      // Counting the live run's 2 USD a second time would project 61.5 and cross the 60 ceiling.
      assert.deepEqual(decision, { decision: 'within', projectedRunUsd: 2.5, projectedMonthUsd: 59.5 });
    });

    it('leaves spend from another calendar month out of the month to date', async () => {
      await costFolder(newRunId(), [renderSession(40, MID_OCTOBER), renderSession(5, MID_NOVEMBER)]);

      const total = await costs.monthToDate.computeUsd(MID_NOVEMBER);

      assert.equal(total, 5);
    });
  });

  describe('ceiling decisions', () => {
    it('puts a run over its run ceiling when the projection exceeds it', () => {
      const decision = checkCostCeilings({ limits: { costPerRunUsd: 3, costPerMonthUsd: 60 }, runSpentUsd: 2.5, estimateUsd: 1, monthToDateUsd: 10 });

      assert.deepEqual(decision, { decision: 'over', ceiling: 'run', projectedUsd: 3.5, estimateUsd: 1, limitUsd: 3 });
    });

    it('puts a run over the month ceiling when the month projection exceeds it', () => {
      const decision = checkCostCeilings({ limits: { costPerRunUsd: 3, costPerMonthUsd: 60 }, runSpentUsd: 1, estimateUsd: 1, monthToDateUsd: 59.5 });

      assert.deepEqual(decision, { decision: 'over', ceiling: 'month', projectedUsd: 60.5, estimateUsd: 1, limitUsd: 60 });
    });

    it('keeps an all-mock run with zero spend within zero ceilings', () => {
      const decision = checkCostCeilings({ limits: { costPerRunUsd: 0, costPerMonthUsd: 0 }, runSpentUsd: 0, estimateUsd: 0, monthToDateUsd: 0 });

      assert.equal(decision.decision, 'within');
    });
  });

  describe('indexer and ledger', () => {
    it('indexes cost.json once; a second pass inserts nothing', async () => {
      const runId = newRunId();
      const runDir = await costFolder(runId, [renderSession(1, MID_NOVEMBER), renderSession(2, MID_NOVEMBER)]);

      const first = await costs.indexer.indexRun({ runId, runDir });
      const second = await costs.indexer.indexRun({ runId, runDir });

      assert.deepEqual(first, { status: 'indexed', runId, inserted: 2, alreadyIndexed: 0 });
      assert.deepEqual(second, { status: 'indexed', runId, inserted: 0, alreadyIndexed: 2 });
    });

    it('answers no-cost-file for a run that has not billed anything', async () => {
      const runId = newRunId();

      const result = await costs.indexer.indexRun({ runId, runDir: runDirectory(home.dataHome.runs, runId) });

      assert.deepEqual(result, { status: 'no-cost-file', runId });
    });

    it('prices mock usage at zero and records the session into cost.json', async () => {
      const runId = newRunId();
      const runDir = runDirectory(home.dataHome.runs, runId);
      const session = renderSession(0, MID_NOVEMBER);

      const result = await costs.ledger.record({ runId, runDir, session });
      const written = await readCostFile(runDir);

      assert.equal(costs.ledger.priceUsd({ kind: 'render', renderSeconds: 30 }), 0);
      assert.equal(result.runTotalUsd, 0);
      assert.ok(written.status === 'present');
      assert.deepEqual(written.value.sessions, [session]);
    });
  });

  describe('typed errors', () => {
    it('refuses a negative or non-finite amount by field name', () => {
      const limits = { costPerRunUsd: 3, costPerMonthUsd: 60 };

      assert.throws(
        () => checkCostCeilings({ limits, runSpentUsd: 0, estimateUsd: -1, monthToDateUsd: 0 }),
        (error: unknown) => error instanceof InvalidCostAmountError && error.field === 'estimateUsd',
      );
      assert.throws(
        () => checkCostCeilings({ limits, runSpentUsd: 0, estimateUsd: 0, monthToDateUsd: Number.NaN }),
        (error: unknown) => error instanceof InvalidCostAmountError && error.field === 'monthToDateUsd',
      );
    });

    it('fails closed with the run id when a cost.json cannot be read', async () => {
      const runId = newRunId();
      const runDir = runDirectory(home.dataHome.runs, runId);
      await mkdir(runDir, { recursive: true });
      await writeFile(join(runDir, 'cost.json'), 'not json', 'utf8');

      await assert.rejects(costs.monthToDate.computeUsd(MID_NOVEMBER), (error: unknown) => {
        assert.ok(error instanceof MonthToDateUnavailableError);
        assert.equal(error.reason, 'unreadable-cost-file');
        assert.equal(error.runId, runId);
        return true;
      });
    });

    it('refuses to index a folder whose name is another run id', async () => {
      const runId = newRunId();
      const otherDir = await costFolder(newRunId(), [renderSession(1, MID_NOVEMBER)]);

      await assert.rejects(costs.indexer.indexRun({ runId, runDir: otherDir }), CostFileRunMismatchError);
    });

    it('refuses a session whose USD differs from the price table answer', async () => {
      const runId = newRunId();
      const runDir = runDirectory(home.dataHome.runs, runId);

      await assert.rejects(costs.ledger.record({ runId, runDir, session: renderSession(1, MID_NOVEMBER) }), CostSessionPriceMismatchError);
      assert.equal((await readCostFile(runDir)).status, 'absent');
    });
  });
});
