import { Module } from '@nestjs/common';
import { MetricInboxSyncModule } from '../metrics/metric-inbox-sync.module';
import { InsightsController } from './insights.controller';

/**
 * Http side of studio insights (PRD 0001 R4 goal 4); the query handler lives in `InsightsModule`.
 * `MetricInboxSyncModule` supplies the ingest that runs before the read (SPEC 0007 section 5.6).
 */
@Module({
  imports: [MetricInboxSyncModule],
  controllers: [InsightsController],
})
export class InsightsApiModule {}
