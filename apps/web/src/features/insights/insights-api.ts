import { InsightsViewSchema, apiPaths, type InsightsView } from '@studio/shared/api';
import { requestJson, type ApiTransport } from '@/lib/api';

/** `GET /insights` (C10 rev 6): the response is parsed with its C10 schema. Read-only. */
export interface InsightsApi {
  getInsights(): Promise<InsightsView>;
}

export function createInsightsApi(transport: ApiTransport): InsightsApi {
  return {
    getInsights: () => requestJson(transport, { method: 'GET', path: apiPaths.insights() }, InsightsViewSchema),
  };
}
