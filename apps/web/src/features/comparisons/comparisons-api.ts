import {
  ComparisonPageSchema,
  ComparisonViewSchema,
  CreateComparisonRequestSchema,
  StartComparisonRequestSchema,
  apiPaths,
  type ComparisonPageView,
  type ComparisonView,
  type CreateComparisonRequest,
  type StartComparisonRequest,
} from '@studio/shared/api';
import { browserTransport, checkedBody, requestJson, type ApiTransport } from '@/lib/api';

/** `GET /comparisons` (C10 `ListComparisonsQuery`): newest first, paged by comparison id. */
export interface ComparisonListParams {
  limit?: number;
  cursor?: string;
}

/**
 * The C10 rev 3 comparison calls (SPEC 0003 section 5.3). Every body is checked with its C10 schema
 * before it is sent and every response is parsed with its C10 schema. Nothing here changes a
 * version's status: promotion stays on the version pages.
 */
export interface ComparisonsApi {
  listComparisons(params?: ComparisonListParams): Promise<ComparisonPageView>;
  getComparison(comparisonId: string): Promise<ComparisonView>;
  createComparison(request: CreateComparisonRequest): Promise<ComparisonView>;
  /** `acceptedWorstCaseUsd` must be the `pairWorstCaseUsd` the owner saw, else 409. */
  startComparison(comparisonId: string, request: StartComparisonRequest): Promise<ComparisonView>;
}

export function createComparisonsApi(transport: ApiTransport): ComparisonsApi {
  return {
    listComparisons: (params = {}) =>
      requestJson(transport, { method: 'GET', path: apiPaths.comparisons(), query: { ...params } }, ComparisonPageSchema),
    getComparison: (comparisonId) =>
      requestJson(transport, { method: 'GET', path: apiPaths.comparison(comparisonId) }, ComparisonViewSchema),
    createComparison: (request) =>
      requestJson(
        transport,
        { method: 'POST', path: apiPaths.comparisons(), body: { kind: 'json', value: checkedBody(CreateComparisonRequestSchema, request) } },
        ComparisonViewSchema,
      ),
    startComparison: (comparisonId, request) =>
      requestJson(
        transport,
        {
          method: 'POST',
          path: apiPaths.comparisonStart(comparisonId),
          body: { kind: 'json', value: checkedBody(StartComparisonRequestSchema, request) },
        },
        ComparisonViewSchema,
      ),
  };
}

/** The comparisons client for client components (same-origin BFF). */
export const browserComparisonsApi: ComparisonsApi = createComparisonsApi(browserTransport);
