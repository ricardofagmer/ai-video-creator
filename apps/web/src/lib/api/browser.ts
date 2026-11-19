import { apiPaths } from '@studio/shared/api';
import { createStudioClient, type StudioClient } from './client';
import { REQUEST_ID_HEADER, newRequestId, type ApiTransport } from './request';

/** Same-origin prefix of the BFF route handler (`src/app/api/studio/[...path]/route.ts`). */
export const BFF_PREFIX = '/api/studio';

/** Where an expired session sends the owner (design/telas/01: "Sessão expirada"). */
export const SESSION_EXPIRED_LOGIN_PATH = '/login?motivo=sessao-expirada';

/**
 * Browser transport: every call goes to the web's own origin, never to the api's port (the api
 * serves no CORS). The httpOnly session cookie travels by itself; no script reads it.
 */
export const browserTransport: ApiTransport = async (request) => {
  const response = await fetch(`${BFF_PREFIX}${request.path}`, {
    method: request.method,
    headers: { ...request.headers, [REQUEST_ID_HEADER]: newRequestId() },
    body: request.body,
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
    signal: request.signal,
  });
  const isLogin = request.path === apiPaths.login();
  if (response.status === 401 && !isLogin && typeof window !== 'undefined') {
    window.location.assign(SESSION_EXPIRED_LOGIN_PATH);
  }
  return response;
};

/** The C10 client for client components. */
export const browserStudioClient: StudioClient = createStudioClient(browserTransport);
