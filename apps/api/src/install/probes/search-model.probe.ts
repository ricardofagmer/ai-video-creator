import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { GetSearchIndexStatusQuery, type SearchIndexStatus } from '@studio/core/embeddings';
import { type ComponentState } from '@studio/shared/api';

/** Optional component: an absent model is `not-installed`, not an error (DI-AC-04). */
export function searchModelComponentState(model: SearchIndexStatus['model']): ComponentState {
  switch (model) {
    case 'ready':
      return 'ok';
    case 'absent':
      return 'not-installed';
    case 'rejected':
      return 'degraded';
  }
}

/**
 * The local embedding model, through the same query as `GET /catalog/search/status` and `studio
 * doctor`: the model folder is verified and loaded once per process and never downloaded. Only
 * the model state is kept; `modelRef` and the index counts are dropped (C1 carries no catalog data).
 */
@Injectable()
export class SearchModelProbe {
  constructor(private readonly queryBus: QueryBus) {}

  async probe(): Promise<ComponentState> {
    const status = await this.queryBus.execute(new GetSearchIndexStatusQuery());
    return searchModelComponentState(status.model);
  }
}
