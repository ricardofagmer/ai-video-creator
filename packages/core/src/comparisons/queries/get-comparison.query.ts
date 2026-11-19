import { Query } from '@nestjs/cqrs';
import { type ComparisonDetail } from '../comparison-view.mapper';

/** `GET /comparisons/:comparisonId` (section 5.3 "Side-by-side view", R2-AC-15), read from both run folders. */
export class GetComparisonQuery extends Query<ComparisonDetail> {
  /** C3 `ComparisonId`; validated by the handler. */
  constructor(readonly comparisonId: string) {
    super();
  }
}
