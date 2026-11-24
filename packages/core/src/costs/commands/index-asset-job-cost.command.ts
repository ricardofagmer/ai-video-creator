import { Command } from '@nestjs/cqrs';
import { type IndexAssetJobCostInput, type IndexAssetJobCostResult } from '../cost-indexer.service';

/**
 * Indexes one asset job's `asset-jobs/<kind>/<ref>/cost.json` into `cost_entries` with
 * `source_kind = 'asset-job'`, `run_id` = the ref and `step_key` = `asset-job:<kind>` (spec
 * Amendment 3). Dispatched by the api when it reads a terminal job and by the CLI doctor; never by
 * the watcher (ADR 0003). Idempotent: rows already present are skipped.
 */
export class IndexAssetJobCostCommand extends Command<IndexAssetJobCostResult> {
  constructor(readonly input: IndexAssetJobCostInput) {
    super();
  }
}
