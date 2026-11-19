import { Query } from '@nestjs/cqrs';

/** Recorded publications per run, keyed by run id; every requested run is present (0 when none). */
export type RunPublicationCounts = Readonly<Record<string, number>>;

/**
 * The rev 5 `publicationCount` of a `GET /runs` page (SPEC 0006 section 4.4): one grouped count
 * for the page's runs instead of one query per row.
 */
export class CountRunPublicationsQuery extends Query<RunPublicationCounts> {
  /** C3 `RunId`s of one page (at most `API_MAX_PAGE_LIMIT`); validated by the handler. */
  constructor(readonly runIds: readonly string[]) {
    super();
  }
}
