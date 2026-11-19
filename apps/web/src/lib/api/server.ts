import 'server-only';
import { SESSION_COOKIE_NAME } from '@studio/shared/api';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { webConfig } from '../config/web-config';
import { SESSION_EXPIRED_LOGIN_PATH } from './browser';
import { createStudioClient, type StudioClient } from './client';
import { REQUEST_ID_HEADER, newRequestId, type ApiTransport } from './request';
import { matchApiPath } from './route-table';

/** Outbound time limit for server-rendered reads (rules/architecture.md: no infinite waits). */
const SERVER_CALL_TIMEOUT_MS = 15_000;

class ApiRouteNotAllowedError extends Error {
  constructor() {
    super('The api path is not in the C10 route table');
    this.name = 'ApiRouteNotAllowedError';
  }
}

/** Only `studio_session=<token>`, never the browser's other cookies. */
async function sessionCookieHeader(): Promise<string | null> {
  const session = (await cookies()).get(SESSION_COOKIE_NAME);
  return session === undefined || session.value === '' ? null : `${SESSION_COOKIE_NAME}=${session.value}`;
}

export type UnauthorizedBehaviour = 'redirect-to-login' | 'throw';

/**
 * Server transport for Server Components: calls the api directly on loopback with the owner's
 * session cookie, through the same C10 allowlist as the BFF. Without a session it redirects to
 * the login page (design/telas/01, "Sem sessão em rota privada").
 */
export function serverTransport(onUnauthorized: UnauthorizedBehaviour): ApiTransport {
  return async (request) => {
    const matched = matchApiPath(request.method, request.path);
    if (matched === null) throw new ApiRouteNotAllowedError();
    const config = webConfig();
    const headers: Record<string, string> = { ...request.headers, [REQUEST_ID_HEADER]: newRequestId() };
    const cookie = await sessionCookieHeader();
    if (cookie !== null) headers.Cookie = cookie;
    if (request.method !== 'GET') headers.Origin = config.webOrigin;
    const signal = request.signal === undefined ? AbortSignal.timeout(SERVER_CALL_TIMEOUT_MS) : request.signal;
    const response = await fetch(`${config.apiBaseUrl}${matched.path}${matched.search}`, {
      method: request.method,
      headers,
      body: request.body,
      cache: 'no-store',
      redirect: 'manual',
      signal,
    });
    if (response.status === 401 && onUnauthorized === 'redirect-to-login') redirect(SESSION_EXPIRED_LOGIN_PATH);
    return response;
  };
}

/** The C10 client for Server Components and route handlers. */
export function serverStudioClient(onUnauthorized: UnauthorizedBehaviour = 'redirect-to-login'): StudioClient {
  return createStudioClient(serverTransport(onUnauthorized));
}
