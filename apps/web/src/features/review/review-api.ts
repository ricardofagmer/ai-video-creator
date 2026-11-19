import {
  PromoteFromRunRequestSchema,
  PromoteFromRunResponseSchema,
  ReviewDecisionRequestSchema,
  ReviewDecisionResponseSchema,
  apiPaths,
  type PromoteFromRunRequest,
  type PromoteFromRunResponse,
  type ReviewDecisionRequest,
  type ReviewDecisionResponse,
} from '@studio/shared/api';
import { browserTransport, checkedBody, requestJson, type ApiTransport } from '@/lib/api';

/**
 * The C10 review calls (API_CONTRACT_REVISION 1). `ReviewDecisionRequest` has no `decidedBy`,
 * `decidedAt` or `correlationId`: the api takes them from the session, its clock and the request
 * id, so the browser never sends them.
 */
export interface ReviewApi {
  recordReview(runId: string, request: ReviewDecisionRequest): Promise<ReviewDecisionResponse>;
  promoteFromRun(runId: string, request: PromoteFromRunRequest): Promise<PromoteFromRunResponse>;
}

function createReviewApi(transport: ApiTransport): ReviewApi {
  return {
    recordReview: (runId, request) =>
      requestJson(
        transport,
        { method: 'POST', path: apiPaths.runReview(runId), body: { kind: 'json', value: checkedBody(ReviewDecisionRequestSchema, request) } },
        ReviewDecisionResponseSchema,
      ),
    promoteFromRun: (runId, request) =>
      requestJson(
        transport,
        { method: 'POST', path: apiPaths.runPromote(runId), body: { kind: 'json', value: checkedBody(PromoteFromRunRequestSchema, request) } },
        PromoteFromRunResponseSchema,
      ),
  };
}

/** The review client for client components (same-origin BFF). */
export const browserReviewApi: ReviewApi = createReviewApi(browserTransport);
