import { Logger } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { type CurationPageView, type CurationView } from '@studio/shared/api';
import { CurationDecisionRepository } from '../curation-decision.repository';
import { queueOf } from '../curation-queue';
import { CurationStore } from '../curation-store';
import { CurationViewAssembler } from '../curation-view.assembler';
import { CurationFileCorruptError } from '../curation.errors';
import { ListCurationsCriteriaSchema, parseCurationInput } from '../curation.input';
import { ListCurationsQuery } from './list-curations.query';

/**
 * Newest first (ULID order, descending), keyed by the curation id. The folders are the source of
 * truth, so the page is cut from the listed files; the decision rows of the page are read in one
 * query. An item whose files are damaged is left out and logged by id; the GET by id reports it.
 */
@QueryHandler(ListCurationsQuery)
export class ListCurationsHandler implements IQueryHandler<ListCurationsQuery, CurationPageView> {
  private readonly logger = new Logger(ListCurationsHandler.name);

  constructor(
    private readonly store: CurationStore,
    private readonly decisions: CurationDecisionRepository,
    private readonly assembler: CurationViewAssembler,
  ) {}

  async execute(query: ListCurationsQuery): Promise<CurationPageView> {
    const criteria = parseCurationInput(ListCurationsCriteriaSchema, query.criteria, 'criteria');
    const stored = await this.store.listAll();
    const queue = queueOf(stored);
    const matching = stored
      .filter(({ file }) => criteria.subjectRef === undefined || file.subject.ref === criteria.subjectRef)
      .reverse();
    const { cursor } = criteria;
    const start = cursor === undefined ? 0 : matching.findIndex(({ curationId }) => curationId < cursor);
    const page = start === -1 ? [] : matching.slice(start, start + criteria.limit);
    const decisions = await this.decisions.findByCurationIds(page.map(({ curationId }) => curationId));
    const items: CurationView[] = [];
    for (const { curationId, file } of page) {
      try {
        items.push(await this.assembler.viewOf(file, queue, decisions.get(curationId) ?? null));
      } catch (error) {
        if (!(error instanceof CurationFileCorruptError)) throw error;
        this.logger.warn({ event: 'curation.list-skipped', curationId, errorName: error.name });
      }
    }
    const last = page.at(-1);
    const hasMore = start !== -1 && start + criteria.limit < matching.length;
    return { items, total: matching.length, nextCursor: hasMore && last !== undefined ? last.curationId : null };
  }
}
