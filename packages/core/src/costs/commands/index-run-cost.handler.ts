import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { CostIndexer, type IndexRunCostResult } from '../cost-indexer.service';
import { IndexRunCostCommand } from './index-run-cost.command';

@CommandHandler(IndexRunCostCommand)
export class IndexRunCostHandler implements ICommandHandler<IndexRunCostCommand, IndexRunCostResult> {
  constructor(private readonly indexer: CostIndexer) {}

  execute(command: IndexRunCostCommand): Promise<IndexRunCostResult> {
    return this.indexer.indexRun(command.input);
  }
}
