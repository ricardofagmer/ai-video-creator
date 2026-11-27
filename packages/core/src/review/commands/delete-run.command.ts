import { Command } from '@nestjs/cqrs';
import { type RunId } from '@studio/shared/run-format';

export interface DeleteRunInput {
  runId: RunId;
}

export interface DeleteRunResult {
  runId: RunId;
}

/**
 * Removes a stopped run for good: its folder under the data home (run.json, stage outputs, the
 * video) and its run index row. Refused while a watcher owns or may take the run, and for a run
 * whose outcome or comparison other records depend on.
 */
export class DeleteRunCommand extends Command<DeleteRunResult> {
  constructor(readonly input: DeleteRunInput) {
    super();
  }
}
