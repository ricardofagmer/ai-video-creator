import { Command } from '@nestjs/cqrs';
import { type RunDraftResult } from '../run-draft.service';

/**
 * Removes the `comparison` link from a `draft` run, leaving an ordinary draft. Used by the
 * comparisons module when the second arm of a pair could not be created (SPEC 0003 section 5.3).
 */
export class DetachRunComparisonCommand extends Command<RunDraftResult> {
  /** C3 `RunId` and `ComparisonId`; validated by the handler. */
  constructor(
    readonly runId: string,
    readonly comparisonId: string,
  ) {
    super();
  }
}
