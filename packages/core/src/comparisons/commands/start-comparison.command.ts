import { Command } from '@nestjs/cqrs';
import { type StartComparisonInput } from '../comparison.input';
import { type ComparisonDetail } from '../comparison-view.mapper';

/**
 * `POST /comparisons/:comparisonId/start` (section 5.3, R2-AC-13, R2-AC-14): the pair's cost gate.
 * On success both run.json files carry `costConsent` and both runs are `pending`, arm A first.
 */
export class StartComparisonCommand extends Command<ComparisonDetail> {
  /** Validated by the handler. */
  constructor(readonly input: StartComparisonInput) {
    super();
  }
}
