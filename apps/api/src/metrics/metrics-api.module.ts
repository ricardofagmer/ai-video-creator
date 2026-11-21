import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PublishAttemptSyncModule } from '../publishing/publish-attempt-sync.module';
import { MetricInboxSyncModule } from './metric-inbox-sync.module';
import { MetricImportsController } from './metric-imports.controller';
import { MetricSnapshotsController } from './metric-snapshots.controller';
import { MetricsResponseAssembler } from './metrics-response.assembler';
import { RunPublicationsController } from './run-publications.controller';

/**
 * Http side of outside signals (SPEC 0006 R3-05). The publication, snapshot and import handlers
 * come from core `MetricsModule`, imported by the root. Nothing here makes an outbound request,
 * writes a file or sets a run status; no agent code is imported (K1). Rev 7 (SPEC 0007): the
 * publications list runs `PublishAttemptSync` and `MetricInboxSync` first; both only dispatch core
 * commands and neither makes an outbound request.
 */
@Module({
  imports: [CqrsModule, PublishAttemptSyncModule, MetricInboxSyncModule],
  controllers: [RunPublicationsController, MetricSnapshotsController, MetricImportsController],
  providers: [MetricsResponseAssembler],
})
export class MetricsApiModule {}
