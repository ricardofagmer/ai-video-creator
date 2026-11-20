import { Command } from '@nestjs/cqrs';
import { type ComparisonArmDraft } from '../run-comparison';
import { type CreateRunDraftInput } from '../run-draft.input';
import { type RunDraftResult } from '../run-draft.service';

/**
 * Creates `runs/<runId>/run.json` as `draft` from a brief and a saved recipe version (api or
 * CLI only, ADR 0003). The brief must satisfy the recipe's `inputs`; every binding and reference
 * must exist in the catalog. `arm` is set only by the comparisons module (SPEC 0003 section 5.3):
 * the allocated run id and the `comparison` link naming the peer run.
 */
export class CreateRunDraftCommand extends Command<RunDraftResult> {
  constructor(
    readonly input: CreateRunDraftInput,
    readonly arm?: ComparisonArmDraft,
  ) {
    super();
  }
}
