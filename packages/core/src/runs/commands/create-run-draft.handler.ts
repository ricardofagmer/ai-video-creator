import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { RunDraftService, type RunDraftResult } from '../run-draft.service';
import { CreateRunDraftCommand } from './create-run-draft.command';

@CommandHandler(CreateRunDraftCommand)
export class CreateRunDraftHandler implements ICommandHandler<CreateRunDraftCommand, RunDraftResult> {
  constructor(private readonly drafts: RunDraftService) {}

  execute(command: CreateRunDraftCommand): Promise<RunDraftResult> {
    return this.drafts.create(command.input, command.arm);
  }
}
