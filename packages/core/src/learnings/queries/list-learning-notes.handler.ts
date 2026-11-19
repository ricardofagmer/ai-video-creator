import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { capLearningsForBrief } from '../learning-brief-caps';
import { LearningNotesReader } from '../learning-notes.reader';
import { ListLearningNotesQuery, type ListLearningNotesResult } from './list-learning-notes.query';

@QueryHandler(ListLearningNotesQuery)
export class ListLearningNotesHandler implements IQueryHandler<ListLearningNotesQuery, ListLearningNotesResult> {
  constructor(private readonly reader: LearningNotesReader) {}

  async execute(query: ListLearningNotesQuery): Promise<ListLearningNotesResult> {
    const criteria = query.criteria;
    if (criteria.scope === 'version') {
      const notes = await this.reader.notesOfVersion(criteria.ref);
      return { scope: 'version', ref: criteria.ref, notes };
    }
    const visible = await this.reader.activeNotesFor(criteria.refs, criteria.cutoff);
    return { scope: 'brief', cutoff: criteria.cutoff, entries: capLearningsForBrief(visible) };
  }
}
