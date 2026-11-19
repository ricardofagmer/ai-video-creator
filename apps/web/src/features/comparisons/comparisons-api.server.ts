import 'server-only';
import { serverTransport } from '@/lib/api/server';
import { createComparisonsApi, type ComparisonsApi } from './comparisons-api';

/** The comparisons client for Server Components; no session redirects to `/login`. */
export function serverComparisonsApi(): ComparisonsApi {
  return createComparisonsApi(serverTransport('redirect-to-login'));
}
