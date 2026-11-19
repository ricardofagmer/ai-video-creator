import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { EmbeddingIndexStatusService, type SearchIndexStatus } from '../embedding-index-status.service';
import { GetSearchIndexStatusQuery } from './get-search-index-status.query';

@QueryHandler(GetSearchIndexStatusQuery)
export class GetSearchIndexStatusHandler implements IQueryHandler<GetSearchIndexStatusQuery, SearchIndexStatus> {
  constructor(private readonly indexStatus: EmbeddingIndexStatusService) {}

  async execute(): Promise<SearchIndexStatus> {
    return this.indexStatus.status();
  }
}
