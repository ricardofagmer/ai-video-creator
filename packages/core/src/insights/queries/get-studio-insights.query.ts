import { Query } from '@nestjs/cqrs';
import { type InsightsView } from '@studio/shared/api';

/** PRD 0001 R4 goal 4: the section 14 success metrics, for `GET /insights` and `studio insights`. */
export class GetStudioInsightsQuery extends Query<InsightsView> {
  /** The instant the metrics are computed at; the month-to-date spend is that instant's month. */
  constructor(readonly at: Date) {
    super();
  }
}
