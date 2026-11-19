import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { type RunPublicationsView } from '@studio/shared/api';
import { RunIdSchema } from '@studio/shared/run-format';
import { platformBaselines, snapshotsInForce } from '../../quality';
import { MetricSnapshotRepository } from '../metric-snapshot.repository';
import { parseMetricsInput } from '../metrics.input';
import { RunPublicationRepository } from '../run-publication.repository';
import { toRunPublicationEntry } from '../run-publications.assembler';
import { GetRunPublicationsQuery } from './get-run-publications.query';

/**
 * Reads only. A run without publications answers an empty list. The baseline flag is computed
 * with the same functions the quality pass uses, over every snapshot in force on the run's
 * platforms, so the page says "Sem efeito na nota" exactly when the score ignores the snapshot.
 */
@QueryHandler(GetRunPublicationsQuery)
export class GetRunPublicationsHandler implements IQueryHandler<GetRunPublicationsQuery, RunPublicationsView> {
  constructor(
    private readonly publications: RunPublicationRepository,
    private readonly snapshots: MetricSnapshotRepository,
  ) {}

  async execute(query: GetRunPublicationsQuery): Promise<RunPublicationsView> {
    const runId = parseMetricsInput(RunIdSchema, query.runId, 'runId');
    const publications = await this.publications.listByRun(runId);
    if (publications.length === 0) return { runId, publications: [] };
    const snapshots = await this.snapshots.listByPublications(publications.map((publication) => publication.publicationId));
    const platforms = [...new Set(publications.map((publication) => publication.platform))];
    const baselines = platformBaselines(snapshotsInForce(await this.snapshots.readPlatformFacts(platforms)));
    return { runId, publications: publications.map((publication) => toRunPublicationEntry(publication, snapshots, baselines)) };
  }
}
