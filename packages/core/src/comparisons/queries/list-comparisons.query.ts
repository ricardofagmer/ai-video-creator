import { Query } from '@nestjs/cqrs';
import { type ListComparisonsCriteria } from '../comparison.input';
import { type ComparisonDetail } from '../comparison-view.mapper';

export interface ComparisonDetailPage {
  items: ComparisonDetail[];
  /** Comparisons in the index in total, independent of the cursor. */
  total: number;
  nextCursor: string | null;
}

/** `GET /comparisons`: newest first; each item is read from its two run folders. */
export class ListComparisonsQuery extends Query<ComparisonDetailPage> {
  /** Validated by the handler. */
  constructor(readonly criteria: ListComparisonsCriteria) {
    super();
  }
}
