import { Command } from '@nestjs/cqrs';
import { type IndexRunCostInput, type IndexRunCostResult } from '../cost-indexer.service';

/**
 * Indexes one run's cost.json into `cost_entries` (SPEC 0002 rev 2). Dispatched by the api when
 * it resyncs run folders and by the CLI; never by the watcher (ADR 0003).
 */
export class IndexRunCostCommand extends Command<IndexRunCostResult> {
  constructor(readonly input: IndexRunCostInput) {
    super();
  }
}
