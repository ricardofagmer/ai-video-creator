import 'server-only';
import { serverTransport } from '@/lib/api/server';
import { createInsightsApi, type InsightsApi } from './insights-api';

/** The insights client for Server Components; no session redirects to `/login`. */
export function serverInsightsApi(): InsightsApi {
  return createInsightsApi(serverTransport('redirect-to-login'));
}
