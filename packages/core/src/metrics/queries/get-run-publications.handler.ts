import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { type RunPublication } from '@prisma/client';
import { type PublicationPollingView, type RunPublicationsView } from '@studio/shared/api';
import { PlatformSchema, type Platform, type PollCursorFile } from '@studio/shared/platforms';
import { RunIdSchema } from '@studio/shared/run-format';
import { PLATFORM_CLOCK, localDateOf, type PlatformClock } from '../../platforms/platform-runtime';
import { PlatformStatusReader, type PlatformSnapshot } from '../../platforms/platform-status.reader';
import { cursorEntryOf, publicationPolling } from '../../platforms/publication-tracking';
import { HealthReader } from '../../platforms/stores/platform-file.stores';
import { platformBaselines, snapshotsInForce } from '../../quality';
import { MetricSnapshotRepository } from '../metric-snapshot.repository';
import { MetricsRowCorruptError } from '../metrics.errors';
import { parseMetricsInput } from '../metrics.input';
import { toPublicationView } from '../metrics.mapper';
import { RunPublicationRepository } from '../run-publication.repository';
import { toRunPublicationEntry } from '../run-publications.assembler';
import { GetRunPublicationsQuery } from './get-run-publications.query';

/**
 * Reads only. A run without publications answers an empty list. The baseline flag is computed
 * with the same functions the quality pass uses, over every snapshot in force on the run's
 * platforms (simulated publications excluded, SPEC 0007 B6), so the page says "Sem efeito na
 * nota" exactly when the score ignores the snapshot. Rev 7 adds each publication's `origin`,
 * `attemptId` and polling line (SPEC 0007 sections 5.5 and 5.9) and each snapshot's `origin`.
 * The api runs `MetricInboxSync` and `PublishAttemptSync` before this query.
 */
@QueryHandler(GetRunPublicationsQuery)
export class GetRunPublicationsHandler implements IQueryHandler<GetRunPublicationsQuery, RunPublicationsView> {
  constructor(
    private readonly publications: RunPublicationRepository,
    private readonly snapshots: MetricSnapshotRepository,
    private readonly platformStatus: PlatformStatusReader,
    private readonly healthReader: HealthReader,
    @Inject(PLATFORM_CLOCK) private readonly clock: PlatformClock,
  ) {}

  async execute(query: GetRunPublicationsQuery): Promise<RunPublicationsView> {
    const runId = parseMetricsInput(RunIdSchema, query.runId, 'runId');
    const rows = await this.publications.listRowsByRun(runId);
    if (rows.length === 0) return { runId, publications: [] };
    const pollingOf = await this.pollingReader(rows);
    const views = rows.map((row) => toPublicationView(row, pollingOf(row)));
    const snapshots = await this.snapshots.listByPublications(views.map((publication) => publication.publicationId));
    const platforms = [...new Set(views.map((publication) => publication.platform))];
    const baselines = platformBaselines(snapshotsInForce(await this.snapshots.readPlatformFacts(platforms)));
    const importOrigins = await this.snapshots.importOrigins(snapshots);
    return {
      runId,
      publications: views.map((publication) => toRunPublicationEntry(publication, { snapshots, baselines, importOrigins })),
    };
  }

  /** Reads each platform's status and the poll cursor once, then derives every row's polling line. */
  private async pollingReader(rows: readonly RunPublication[]): Promise<(row: RunPublication) => PublicationPollingView> {
    const statuses = new Map<Platform, PlatformSnapshot>();
    for (const row of rows) {
      const platform = this.platformOf(row);
      if (!statuses.has(platform)) statuses.set(platform, await this.platformStatus.snapshot(platform));
    }
    const cursor: PollCursorFile | null = await this.healthReader.readCursor();
    const today = localDateOf(this.clock.now());
    return (row) => {
      const status = statuses.get(this.platformOf(row));
      if (status === undefined) throw new MetricsRowCorruptError('run_publications', row.id);
      return publicationPolling({
        mode: status.mode,
        metricsStatus: status.status.metrics,
        origin: row.origin,
        pollFrom: row.publishedOn ?? localDateOf(row.recordedAt),
        entry: cursorEntryOf(cursor, row.id),
        today,
      });
    };
  }

  private platformOf(row: RunPublication): Platform {
    const platform = PlatformSchema.safeParse(row.platform);
    if (!platform.success) throw new MetricsRowCorruptError('run_publications', row.id);
    return platform.data;
  }
}
