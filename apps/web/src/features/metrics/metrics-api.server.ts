import 'server-only';
import { serverTransport } from '@/lib/api/server';
import { createMetricsApi, type MetricsApi } from './metrics-api';

/** The metrics client for Server Components; no session redirects to `/login`. */
export function serverMetricsApi(): MetricsApi {
  return createMetricsApi(serverTransport('redirect-to-login'));
}
