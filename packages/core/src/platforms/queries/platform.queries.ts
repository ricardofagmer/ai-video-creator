import { Query } from '@nestjs/cqrs';
import { type PlatformsView, type RunPublishView } from '@studio/shared/api';

/*
 * The platform queries (C10 rev 7). Read-only: the api runs `MetricInboxSync` before
 * `GET /platforms` and `SyncPublishAttemptsCommand` before `GET /runs/:runId/publish`, so these
 * handlers never write a file or a row themselves.
 */

/** `GET /platforms`, `studio platforms list`: the three cards, each exactly once. */
export class GetPlatformsQuery extends Query<PlatformsView> {}

/** `GET /runs/:runId/publish`: the publish dialog of one run. `runId` is checked by the handler. */
export class GetRunPublishQuery extends Query<RunPublishView> {
  constructor(readonly runId: string) {
    super();
  }
}
