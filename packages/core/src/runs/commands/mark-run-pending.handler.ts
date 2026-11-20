import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { RunDraftService, type RunDraftResult } from '../run-draft.service';
import { MarkRunPendingCommand } from './mark-run-pending.command';

@CommandHandler(MarkRunPendingCommand)
export class MarkRunPendingHandler implements ICommandHandler<MarkRunPendingCommand, RunDraftResult> {
  constructor(private readonly drafts: RunDraftService) {}

  execute(command: MarkRunPendingCommand): Promise<RunDraftResult> {
    return this.drafts.markPending(command.runId, command.consent);
  }
}
