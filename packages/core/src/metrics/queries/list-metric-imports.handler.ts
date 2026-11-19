import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { type MetricImportPageView } from '@studio/shared/api';
import { MetricImportRepository } from '../metric-import.repository';
import { ListMetricImportsCriteriaSchema, parseMetricsInput } from '../metrics.input';
import { ListMetricImportsQuery } from './list-metric-imports.query';

/** Newest first, keyed by the time-ordered import id (rules/backend.md pagination). */
@QueryHandler(ListMetricImportsQuery)
export class ListMetricImportsHandler implements IQueryHandler<ListMetricImportsQuery, MetricImportPageView> {
  constructor(private readonly imports: MetricImportRepository) {}

  async execute(query: ListMetricImportsQuery): Promise<MetricImportPageView> {
    const criteria = parseMetricsInput(ListMetricImportsCriteriaSchema, query.criteria, 'criteria');
    const page = await this.imports.listPage({ limit: criteria.limit, cursor: criteria.cursor });
    const last = page.items.at(-1);
    return { items: page.items, total: page.total, nextCursor: page.hasMore && last !== undefined ? last.importId : null };
  }
}
