import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MetricInboxSync } from './metric-inbox.sync';

/**
 * One `MetricInboxSync` for the api process (SPEC 0007 section 5.6), shared by the publications,
 * platforms and insights reads. `IngestMetricBatch` itself comes from core `MetricsModule`,
 * imported by the root.
 */
@Module({
  imports: [CqrsModule],
  providers: [MetricInboxSync],
  exports: [MetricInboxSync],
})
export class MetricInboxSyncModule {}
