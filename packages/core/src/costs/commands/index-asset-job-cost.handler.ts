import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { CostIndexer, type IndexAssetJobCostResult } from '../cost-indexer.service';
import { IndexAssetJobCostCommand } from './index-asset-job-cost.command';

@CommandHandler(IndexAssetJobCostCommand)
export class IndexAssetJobCostHandler implements ICommandHandler<IndexAssetJobCostCommand, IndexAssetJobCostResult> {
  constructor(private readonly indexer: CostIndexer) {}

  execute(command: IndexAssetJobCostCommand): Promise<IndexAssetJobCostResult> {
    return this.indexer.indexAssetJob(command.input);
  }
}
