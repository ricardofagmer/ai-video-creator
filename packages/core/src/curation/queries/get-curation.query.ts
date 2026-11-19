import { Query } from '@nestjs/cqrs';
import { type CurationView } from '@studio/shared/api';

/** `GET /curations/:curationId`: the files, plus the decision row once the owner decided. */
export class GetCurationQuery extends Query<CurationView> {
  /** Validated by the handler. */
  constructor(readonly curationId: string) {
    super();
  }
}
