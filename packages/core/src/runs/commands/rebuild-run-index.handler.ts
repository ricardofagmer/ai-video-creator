import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { RunIndexService, type RunIndexRebuildReport } from '../run-index.service';
import { RebuildRunIndexCommand } from './rebuild-run-index.command';

@CommandHandler(RebuildRunIndexCommand)
export class RebuildRunIndexHandler implements ICommandHandler<RebuildRunIndexCommand, RunIndexRebuildReport> {
  constructor(private readonly index: RunIndexService) {}

  execute(): Promise<RunIndexRebuildReport> {
    return this.index.rebuild();
  }
}
