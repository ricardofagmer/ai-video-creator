import { Query } from '@nestjs/cqrs';
import { type RunPublicationsView } from '@studio/shared/api';

/**
 * `GET /runs/:runId/publications` (SPEC 0006 section 4.4): each publication with its snapshot in
 * force, up to 20 older ones and whether its platform has a baseline yet.
 */
export class GetRunPublicationsQuery extends Query<RunPublicationsView> {
  /** C3 `RunId`; validated by the handler. */
  constructor(readonly runId: string) {
    super();
  }
}
