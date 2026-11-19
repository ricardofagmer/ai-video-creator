import {
  SearchIndexStatusResponseSchema,
  SemanticSearchRequestSchema,
  SemanticSearchResponseSchema,
  apiPaths,
  type SearchIndexStatusResponse,
  type SemanticSearchRequest,
  type SemanticSearchResponse,
} from '@studio/shared/api';
import { browserTransport, checkedBody, requestJson, type ApiTransport } from '@/lib/api';

/**
 * The C10 rev 3 search-by-meaning calls (SPEC 0003 section 5.2). The query travels in a POST body,
 * never in a URL, so neither the browser history nor an access log keeps it. Bodies are checked
 * with their C10 schema before sending and responses are parsed with theirs.
 */
export interface SemanticSearchApi {
  search(request: SemanticSearchRequest): Promise<SemanticSearchResponse>;
  indexStatus(): Promise<SearchIndexStatusResponse>;
}

export function createSemanticSearchApi(transport: ApiTransport): SemanticSearchApi {
  return {
    search: (request) =>
      requestJson(
        transport,
        { method: 'POST', path: apiPaths.catalogSearch(), body: { kind: 'json', value: checkedBody(SemanticSearchRequestSchema, request) } },
        SemanticSearchResponseSchema,
      ),
    indexStatus: () => requestJson(transport, { method: 'GET', path: apiPaths.catalogSearchStatus() }, SearchIndexStatusResponseSchema),
  };
}

/** The search client for client components (same-origin BFF). */
export const browserSemanticSearchApi: SemanticSearchApi = createSemanticSearchApi(browserTransport);
