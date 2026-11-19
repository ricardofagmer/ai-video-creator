import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { RunDraftService, type RunDraftResult } from '../run-draft.service';
import { DetachRunComparisonCommand } from './detach-run-comparison.command';

@CommandHandler(DetachRunComparisonCommand)
export class DetachRunComparisonHandler implements ICommandHandler<DetachRunComparisonCommand, RunDraftResult> {
  constructor(private readonly drafts: RunDraftService) {}

  execute(command: DetachRunComparisonCommand): Promise<RunDraftResult> {
    return this.drafts.detachComparison(command.runId, command.comparisonId);
  }
}
