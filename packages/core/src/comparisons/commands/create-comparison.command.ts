import { Command } from '@nestjs/cqrs';
import { type CreateComparisonInput } from '../comparison.input';
import { type ComparisonDetail } from '../comparison-view.mapper';

/**
 * `POST /comparisons` (SPEC 0003 section 5.3, R2-AC-12): two `draft` runs from one brief that
 * differ only in the compared version, linked to each other. Nothing is spent until the start.
 */
export class CreateComparisonCommand extends Command<ComparisonDetail> {
  /** Validated by the handler. */
  constructor(readonly input: CreateComparisonInput) {
    super();
  }
}
