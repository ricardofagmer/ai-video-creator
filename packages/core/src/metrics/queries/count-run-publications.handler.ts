import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { API_MAX_PAGE_LIMIT } from '@studio/shared/api';
import { RunIdSchema } from '@studio/shared/run-format';
import { z } from 'zod';
import { parseMetricsInput } from '../metrics.input';
import { RunPublicationRepository } from '../run-publication.repository';
import { CountRunPublicationsQuery, type RunPublicationCounts } from './count-run-publications.query';

const RunIdPageSchema = z.array(RunIdSchema).max(API_MAX_PAGE_LIMIT);

/**
 * Reads only. One grouped query per page, none for an empty page; a run with no publication
 * answers 0, so the api can fill `publicationCount` on every row it lists.
 */
@QueryHandler(CountRunPublicationsQuery)
export class CountRunPublicationsHandler implements IQueryHandler<CountRunPublicationsQuery, RunPublicationCounts> {
  constructor(@Inject(RunPublicationRepository) private readonly publications: Pick<RunPublicationRepository, 'countByRuns'>) {}

  async execute(query: CountRunPublicationsQuery): Promise<RunPublicationCounts> {
    const runIds = [...new Set(parseMetricsInput(RunIdPageSchema, query.runIds, 'runIds'))];
    if (runIds.length === 0) return {};
    const counted = await this.publications.countByRuns(runIds);
    return Object.fromEntries(runIds.map((runId) => [runId, counted.get(runId) ?? 0]));
  }
}
