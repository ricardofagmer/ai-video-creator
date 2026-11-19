import { IndexCurationCostCommand } from '@studio/core/costs';
import { type CurationId } from '@studio/shared/curation';
import { errorLabel } from '../errors/error-report.js';
import { type CliContext } from '../nest/cli-context.js';

export interface CurationSettlementReport {
  curations: number;
  /** cost_entries rows added across all curations (SPEC 0005 B1). */
  insertedCostEntries: number;
  /** Error class names only; a message may quote a curation folder path. */
  failures: { curationId: CurationId; error: string }[];
}

/**
 * Indexes the cost.json of terminal curations into `cost_entries` through the core handler
 * (`IndexCurationCostCommand`, SPEC 0005 B16), the same way `settleRuns` indexes runs. A terminal
 * curation's cost.json is never written again, so indexing it is final; the command is idempotent.
 * One curation at a time (SQLite has one writer); a failing one is reported and the others still run.
 */
export async function settleCurations(context: CliContext, curationIds: readonly CurationId[]): Promise<CurationSettlementReport> {
  const report: CurationSettlementReport = { curations: 0, insertedCostEntries: 0, failures: [] };
  for (const curationId of curationIds) {
    try {
      const cost = await context.commandBus.execute(new IndexCurationCostCommand({ curationId }));
      if (cost.status === 'indexed') report.insertedCostEntries += cost.inserted;
      report.curations += 1;
    } catch (error) {
      report.failures.push({ curationId, error: errorLabel(error) });
    }
  }
  return report;
}
