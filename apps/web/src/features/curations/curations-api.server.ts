import 'server-only';
import { serverTransport } from '@/lib/api/server';
import { createCurationsApi, type CurationsApi } from './curations-api';

/** The curations client for Server Components; no session redirects to `/login`. */
export function serverCurationsApi(): CurationsApi {
  return createCurationsApi(serverTransport('redirect-to-login'));
}
