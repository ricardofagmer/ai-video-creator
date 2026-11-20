import { Controller, Get, Header, Inject } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { GetStudioInsightsQuery } from '@studio/core/insights';
import { apiRouteSegments, type InsightsView } from '@studio/shared/api';

/** The one query this controller dispatches (the query bus satisfies it). */
export interface InsightsQueryPort {
  execute(query: GetStudioInsightsQuery): Promise<InsightsView>;
}

/**
 * `GET /insights` (C10 rev 6, PRD 0001 R4 goal 4): the section 14 success metrics. Read-only and
 * behind the global session guard like every route but `health` and `auth/login`.
 */
@Controller(apiRouteSegments.insights)
export class InsightsController {
  constructor(@Inject(QueryBus) private readonly queries: InsightsQueryPort) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  read(): Promise<InsightsView> {
    return this.queries.execute(new GetStudioInsightsQuery(new Date()));
  }
}
