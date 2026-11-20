import { Command } from '@nestjs/cqrs';
import { type ComparisonStartConsent } from '../run-comparison';
import { type RunDraftResult } from '../run-draft.service';

/**
 * Starts a run: `draft` -> `pending` in run.json, refused while a watcher owns the run. An arm of
 * an A/B comparison is refused without `consent`; the comparison start passes the pair's cost
 * consent, written in the same run.json write (SPEC 0003 section 5.3).
 */
export class MarkRunPendingCommand extends Command<RunDraftResult> {
  /** `runId` is a C3 `RunId`; both are validated by the handler. */
  constructor(
    readonly runId: string,
    readonly consent?: ComparisonStartConsent,
  ) {
    super();
  }
}
