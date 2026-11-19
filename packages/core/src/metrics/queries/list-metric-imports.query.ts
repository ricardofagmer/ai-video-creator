import { Query } from '@nestjs/cqrs';
import { type MetricImportPageView } from '@studio/shared/api';
import { type ListMetricImportsCriteria } from '../metrics.input';

/** `GET /metrics/imports`: applied imports, newest first, paginated. */
export class ListMetricImportsQuery extends Query<MetricImportPageView> {
  /** Validated by the handler. */
  constructor(readonly criteria: ListMetricImportsCriteria = {}) {
    super();
  }
}
