import {
  CreateCurationRequestSchema,
  CurationDecisionRequestSchema,
  CurationPageViewSchema,
  CurationViewSchema,
  apiPaths,
  type CreateCurationRequest,
  type CurationDecisionRequest,
  type CurationPageView,
  type CurationView,
} from '@studio/shared/api';
import { browserTransport, checkedBody, requestJson, type ApiTransport } from '@/lib/api';

/** `GET /curations` (C10 rev 4 `ListCurationsQuery`): newest first, optionally one subject version. */
export interface CurationListParams {
  limit?: number;
  cursor?: string;
  subjectRef?: string;
}

/**
 * The C10 rev 4 curation calls (SPEC 0005 section 4.4). Every body is checked with its C10 schema
 * before it is sent and every response is parsed with its C10 schema. No call here makes a version
 * `active` (AC 35): `save-draft` saves a draft, `compare` creates a comparison without starting it.
 */
export interface CurationsApi {
  listCurations(params?: CurationListParams): Promise<CurationPageView>;
  getCuration(curationId: string): Promise<CurationView>;
  /** `acceptedWorstCaseUsd` must equal `curationBounds.maxUsd` ($1.00), else 409. */
  requestCuration(request: CreateCurationRequest): Promise<CurationView>;
  decide(curationId: string, request: CurationDecisionRequest): Promise<CurationView>;
}

export function createCurationsApi(transport: ApiTransport): CurationsApi {
  return {
    listCurations: (params = {}) =>
      requestJson(transport, { method: 'GET', path: apiPaths.curations(), query: { ...params } }, CurationPageViewSchema),
    getCuration: (curationId) => requestJson(transport, { method: 'GET', path: apiPaths.curation(curationId) }, CurationViewSchema),
    requestCuration: (request) =>
      requestJson(
        transport,
        { method: 'POST', path: apiPaths.curations(), body: { kind: 'json', value: checkedBody(CreateCurationRequestSchema, request) } },
        CurationViewSchema,
      ),
    decide: (curationId, request) =>
      requestJson(
        transport,
        {
          method: 'POST',
          path: apiPaths.curationDecision(curationId),
          body: { kind: 'json', value: checkedBody(CurationDecisionRequestSchema, request) },
        },
        CurationViewSchema,
      ),
  };
}

/** The curations client for client components (same-origin BFF). */
export const browserCurationsApi: CurationsApi = createCurationsApi(browserTransport);
