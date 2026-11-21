import {
  PublishAttemptViewSchema,
  PublishRequestSchema,
  RunPublishViewSchema,
  apiPaths,
  type PublishAttemptView,
  type PublishRequest,
  type RunPublishView,
} from '@studio/shared/api';
import { type Platform } from '@studio/shared/metrics';
import { browserTransport, checkedBody, requestJson, type ApiTransport } from '@/lib/api';

/**
 * The C10 rev 7 publish calls (SPEC 0007 sections 4.4 and 5.4), through the BFF route table. A
 * publish request only records the owner's click: the api answers at once and the watcher sends
 * the bytes between runs. No response carries a title, a caption, a tag, a URL or a path.
 */
export interface PublishingApi {
  getRunPublish(runId: string, signal?: AbortSignal): Promise<RunPublishView>;
  /** 202 for a new attempt; 200 with the same attempt when `idempotencyKey` repeats. */
  requestPublish(options: { runId: string; platform: Platform; request: PublishRequest }): Promise<PublishAttemptView>;
  /** Works only before the watcher claims the attempt (`publish-attempt-not-cancellable`). */
  cancelAttempt(runId: string, attemptId: string): Promise<PublishAttemptView>;
}

export function createPublishingApi(transport: ApiTransport): PublishingApi {
  return {
    getRunPublish: (runId, signal) => requestJson(transport, { method: 'GET', path: apiPaths.runPublish(runId), signal }, RunPublishViewSchema),
    requestPublish: ({ runId, platform, request }) =>
      requestJson(
        transport,
        {
          method: 'POST',
          path: apiPaths.runPublishPlatform(runId, platform),
          body: { kind: 'json', value: checkedBody(PublishRequestSchema, request) },
        },
        PublishAttemptViewSchema,
      ),
    cancelAttempt: (runId, attemptId) =>
      requestJson(transport, { method: 'DELETE', path: apiPaths.runPublishAttempt(runId, attemptId) }, PublishAttemptViewSchema),
  };
}

/** The publishing client for client components (same-origin BFF). */
export const browserPublishingApi: PublishingApi = createPublishingApi(browserTransport);
