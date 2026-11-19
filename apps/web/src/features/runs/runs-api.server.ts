import 'server-only';
import { serverTransport } from '@/lib/api/server';
import { createRunsApi, type RunsApi } from './runs-api';

/** The runs client for Server Components; no session redirects to `/login` (design/telas/01). */
export function serverRunsApi(): RunsApi {
  return createRunsApi(serverTransport('redirect-to-login'));
}
