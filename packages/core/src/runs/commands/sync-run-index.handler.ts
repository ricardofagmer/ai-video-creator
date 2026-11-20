import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { RunFileNotFoundError, runDirectory } from '@studio/shared/run-files';
import { RunIdSchema } from '@studio/shared/run-format';
import { DataHome } from '../../paths/data-home';
import { parseRunInput } from '../run-draft.input';
import { type RunIndexEntry } from '../run-index.mapper';
import { RunIndexService } from '../run-index.service';
import { RunNotFoundError } from '../runs.errors';
import { SyncRunIndexCommand } from './sync-run-index.command';

@CommandHandler(SyncRunIndexCommand)
export class SyncRunIndexHandler implements ICommandHandler<SyncRunIndexCommand, RunIndexEntry> {
  constructor(
    private readonly dataHome: DataHome,
    private readonly index: RunIndexService,
  ) {}

  async execute(command: SyncRunIndexCommand): Promise<RunIndexEntry> {
    const runId = parseRunInput(RunIdSchema, command.runId, 'runId');
    try {
      return await this.index.syncRun(runDirectory(this.dataHome.runs, runId));
    } catch (error) {
      if (error instanceof RunFileNotFoundError) throw new RunNotFoundError(runId);
      throw error;
    }
  }
}
