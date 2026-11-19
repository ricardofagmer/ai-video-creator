import { Query } from '@nestjs/cqrs';
import { type CurationPageView } from '@studio/shared/api';
import { type ListCurationsCriteria } from '../curation.input';

/** `GET /curations`: newest first, optionally one subject version only. */
export class ListCurationsQuery extends Query<CurationPageView> {
  /** Validated by the handler. */
  constructor(readonly criteria: ListCurationsCriteria) {
    super();
  }
}
