import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { type MetricSnapshotView } from '@studio/shared/api';
import { metricsBounds } from '@studio/shared/metrics';
import { PrismaService } from '../../prisma';
import { QualityScoreService } from '../../quality';
import { MetricSnapshotRepository } from '../metric-snapshot.repository';
import { MetricSnapshotLimitReachedError, MetricsAsOfInFutureError, PublicationNotFoundError } from '../metrics.errors';
import { SaveMetricSnapshotInputSchema, isAfterLocalToday, parseMetricsInput } from '../metrics.input';
import { RunPublicationRepository } from '../run-publication.repository';
import { SaveMetricSnapshotCommand } from './save-metric-snapshot.command';

/**
 * The form path of OD2. The body is the shared `PlatformMetrics` schema (bounded counts, `views`
 * required); the day must not be after today; the publication must belong to the run. One upsert
 * keyed `(publication, asOfDate, 'form')`, then the rescore after the commit (section 5.4).
 */
@CommandHandler(SaveMetricSnapshotCommand)
export class SaveMetricSnapshotHandler implements ICommandHandler<SaveMetricSnapshotCommand, MetricSnapshotView> {
  private readonly logger = new Logger(SaveMetricSnapshotHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly publications: RunPublicationRepository,
    private readonly snapshots: MetricSnapshotRepository,
    private readonly quality: QualityScoreService,
  ) {}

  async execute(command: SaveMetricSnapshotCommand): Promise<MetricSnapshotView> {
    const input = parseMetricsInput(SaveMetricSnapshotInputSchema, command.input, '');
    const now = new Date();
    if (isAfterLocalToday(input.asOfDate, now)) throw new MetricsAsOfInFutureError(input.asOfDate);
    const key: { publicationId: string; asOfDate: string; source: 'form' } = {
      publicationId: input.publicationId,
      asOfDate: input.asOfDate,
      source: 'form',
    };
    const snapshot = await this.prisma.$transaction(async (transaction) => {
      if ((await this.publications.findInRun(input.runId, input.publicationId, transaction)) === null) {
        throw new PublicationNotFoundError(input.runId, input.publicationId);
      }
      // Replacing an existing day never grows the history; only a new day counts against the bound.
      const isNewDay = !(await this.snapshots.exists(key, transaction));
      if (isNewDay && (await this.snapshots.countByPublication(input.publicationId, transaction)) >= metricsBounds.maxSnapshotsPerPublication) {
        throw new MetricSnapshotLimitReachedError(input.publicationId, metricsBounds.maxSnapshotsPerPublication);
      }
      return this.snapshots.upsert({ ...key, importId: null, metrics: input.metrics, recordedAt: now }, transaction);
    });
    // Keys and the source only: never a metric value (section 7).
    this.logger.log({
      event: 'metrics.snapshot-saved',
      publicationId: snapshot.publicationId,
      asOfDate: snapshot.asOfDate,
      source: snapshot.source,
      correlationId: input.correlationId,
    });
    await this.quality.recomputeAfterMetrics({ change: 'snapshot-saved', correlationId: input.correlationId });
    // SPEC 0007 section 5.6: a form snapshot's origin is always `form`.
    return { ...snapshot, origin: 'form' };
  }
}
