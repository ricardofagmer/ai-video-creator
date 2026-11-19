import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { CostIndexer, type IndexCurationCostResult } from '../cost-indexer.service';
import { IndexCurationCostCommand } from './index-curation-cost.command';

@CommandHandler(IndexCurationCostCommand)
export class IndexCurationCostHandler implements ICommandHandler<IndexCurationCostCommand, IndexCurationCostResult> {
  constructor(private readonly indexer: CostIndexer) {}

  execute(command: IndexCurationCostCommand): Promise<IndexCurationCostResult> {
    return this.indexer.indexCuration(command.input);
  }
}
