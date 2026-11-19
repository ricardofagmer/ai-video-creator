import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PrismaModule } from '../prisma/prisma.module';
import { QualityModule } from '../quality/quality.module';
import { ImportMetricsHandler } from './commands/import-metrics.handler';
import { RecordPublicationHandler } from './commands/record-publication.handler';
import { RemovePublicationHandler } from './commands/remove-publication.handler';
import { SaveMetricSnapshotHandler } from './commands/save-metric-snapshot.handler';
import { MetricImportRepository } from './metric-import.repository';
import { MetricSnapshotRepository } from './metric-snapshot.repository';
import { GetRunPublicationsHandler } from './queries/get-run-publications.handler';
import { ListMetricImportsHandler } from './queries/list-metric-imports.handler';
import { RunPublicationRepository } from './run-publication.repository';

/**
 * Outside signals for the api and the CLI (SPEC 0006 sections 5.1 to 5.4, C10 rev 5): record and
 * remove publications, save form snapshots, import CSV exports, and read them back. These handlers
 * are the only writers of `run_publications`, `platform_metric_snapshots` and `metric_imports`
 * (ADR 0003), and they rescore through `QualityModule` after each commit. Nothing here makes an
 * outbound request or writes a run status. The watcher never imports this module (K1). The
 * composition root registers `CqrsModule.forRoot()`.
 */
@Module({
  imports: [CqrsModule, PrismaModule, QualityModule],
  providers: [
    RunPublicationRepository,
    MetricSnapshotRepository,
    MetricImportRepository,
    RecordPublicationHandler,
    RemovePublicationHandler,
    SaveMetricSnapshotHandler,
    ImportMetricsHandler,
    GetRunPublicationsHandler,
    ListMetricImportsHandler,
  ],
})
export class MetricsModule {}
