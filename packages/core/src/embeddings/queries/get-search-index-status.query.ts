import { Query } from '@nestjs/cqrs';
import { type SearchIndexStatus } from '../embedding-index-status.service';

/** `GET /catalog/search/status` and the `studio doctor` model and index lines (SPEC 0003 section 7). */
export class GetSearchIndexStatusQuery extends Query<SearchIndexStatus> {}
