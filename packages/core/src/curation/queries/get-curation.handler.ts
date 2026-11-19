import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { type CurationView } from '@studio/shared/api';
import { CurationIdSchema } from '@studio/shared/curation';
import { queueOf } from '../curation-queue';
import { CurationStore } from '../curation-store';
import { CurationViewAssembler } from '../curation-view.assembler';
import { CurationNotFoundError } from '../curation.errors';
import { parseCurationInput } from '../curation.input';
import { GetCurationQuery } from './get-curation.query';

/** Reads only: the queue is listed only while the curation waits, for its position. */
@QueryHandler(GetCurationQuery)
export class GetCurationHandler implements IQueryHandler<GetCurationQuery, CurationView> {
  constructor(
    private readonly store: CurationStore,
    private readonly assembler: CurationViewAssembler,
  ) {}

  async execute(query: GetCurationQuery): Promise<CurationView> {
    const curationId = parseCurationInput(CurationIdSchema, query.curationId, 'curationId');
    const file = await this.store.readState(curationId);
    if (file === null) throw new CurationNotFoundError(curationId);
    const queue = queueOf(file.status === 'requested' ? await this.store.listAll() : []);
    return this.assembler.viewOf(file, queue);
  }
}
