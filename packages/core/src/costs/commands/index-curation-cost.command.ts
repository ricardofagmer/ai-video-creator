import { Command } from '@nestjs/cqrs';
import { type IndexCurationCostInput, type IndexCurationCostResult } from '../cost-indexer.service';

/**
 * Indexes one curation's `curations/<id>/cost.json` into `cost_entries` with
 * `source_kind = 'curation'` (SPEC 0005 section 5.7, B16). Dispatched by the api when it reads a
 * terminal curation and by the CLI doctor; never by the watcher (ADR 0003).
 */
export class IndexCurationCostCommand extends Command<IndexCurationCostResult> {
  constructor(readonly input: IndexCurationCostInput) {
    super();
  }
}
