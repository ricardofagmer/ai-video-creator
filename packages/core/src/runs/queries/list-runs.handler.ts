import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { parseRunInput } from '../run-draft.input';
import { toRunIndexEntry } from '../run-index.mapper';
import { RunIndexRepository } from '../run-index.repository';
import { ListRunsCriteriaSchema, ListRunsQuery, type RunIndexPage } from './list-runs.query';

@QueryHandler(ListRunsQuery)
export class ListRunsHandler implements IQueryHandler<ListRunsQuery, RunIndexPage> {
  constructor(private readonly entries: RunIndexRepository) {}

  async execute(query: ListRunsQuery): Promise<RunIndexPage> {
    const criteria = parseRunInput(ListRunsCriteriaSchema, query.criteria, 'criteria');
    const page = await this.entries.page(criteria.statuses ?? null, { beforeRunId: criteria.cursor ?? null, limit: criteria.limit });
    const last = page.rows.at(-1);
    return {
      items: page.rows.map(toRunIndexEntry),
      total: page.total,
      nextCursor: page.hasMore && last !== undefined ? last.id : null,
    };
  }
}
