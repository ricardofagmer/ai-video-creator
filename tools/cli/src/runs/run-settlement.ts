import { IndexRunCostCommand } from '@studio/core/costs';
import { SyncRunIndexCommand } from '@studio/core/runs';
import { type RunId, type RunStatus } from '@studio/shared/run-format';
import { errorLabel } from '../errors/error-report.js';
import { type CliContext } from '../nest/cli-context.js';
import { type RunSnapshot } from './run-reader.js';

/**
 * Statuses in which no watcher writes cost.json any more until the owner acts. Indexing is
 * idempotent (C8 unique key per session), so a run indexed while `waiting` and again after a
 * resume only gains the new sessions.
 */
const SETTLED_STATUSES: readonly RunStatus[] = ['waiting', 'paused', 'failed', 'interrupted', 'review', 'approved', 'rejected'];

export function isSettled(snapshot: RunSnapshot): boolean {
  return snapshot.watcher.status !== 'alive' && SETTLED_STATUSES.includes(snapshot.displayedStatus);
}

export interface SettlementTarget {
  runId: RunId;
  runDir: string;
}

export interface SettlementReport {
  runs: number;
  /** cost_entries rows added across all runs (SPEC 0002 rev 2). */
  insertedCostEntries: number;
  /** Error class names only; a message may quote a run folder path. */
  failures: { runId: RunId; error: string }[];
}

/**
 * Mirrors settled runs into SQLite through the core handlers: cost.json into `cost_entries`
 * (`IndexRunCostCommand`, SPEC 0002 rev 2) and run.json into the run index (`SyncRunIndexCommand`,
 * files win). One run at a time (SQLite has one writer); a failing run is reported and the others
 * still run, because this is bookkeeping beside the command the owner asked for.
 */
export async function settleRuns(context: CliContext, targets: readonly SettlementTarget[]): Promise<SettlementReport> {
  const report: SettlementReport = { runs: 0, insertedCostEntries: 0, failures: [] };
  for (const target of targets) {
    try {
      const cost = await context.commandBus.execute(new IndexRunCostCommand({ runId: target.runId, runDir: target.runDir }));
      if (cost.status === 'indexed') report.insertedCostEntries += cost.inserted;
      await context.commandBus.execute(new SyncRunIndexCommand(target.runId));
      report.runs += 1;
    } catch (error) {
      report.failures.push({ runId: target.runId, error: errorLabel(error) });
    }
  }
  return report;
}
