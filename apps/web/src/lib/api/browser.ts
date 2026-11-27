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

/**
 * Same-origin URL of a voice sample for `<audio src>`, through the BFF like every other call. The
 * `amostra` value only makes the browser fetch again when the sample changed (`updatedAt`): the
 * route takes no query, so the BFF drops it before the api, and the clip stays `no-store`.
 */
export function voiceSampleAudioUrl(assetId: string, version: number, cacheKey: string): string {
  const path = `${BFF_PREFIX}${apiPaths.assetVoiceSampleAudio(assetId, version)}`;
  return cacheKey === '' ? path : `${path}?amostra=${encodeURIComponent(cacheKey)}`;
}

/** Same-origin URL of a stored music track for `<audio src>`, through the BFF like every other call. */
export function storedAudioUrl(assetId: string, version: number): string {
  return `${BFF_PREFIX}${apiPaths.assetAudio(assetId, version)}`;
}

/**
 * Same-origin URLs of a template preview's clip and poster frame (template preview, 2026-11-25). The
 * `previa` value only makes the browser fetch again after a new render (`updatedAt`); the BFF drops it.
 */
export function templatePreviewMediaUrls(assetId: string, version: number, cacheKey: string): { clip: string; poster: string } {
  const query = cacheKey === '' ? '' : `?previa=${encodeURIComponent(cacheKey)}`;
  return {
    clip: `${BFF_PREFIX}${apiPaths.assetTemplatePreviewClip(assetId, version)}${query}`,
    poster: `${BFF_PREFIX}${apiPaths.assetTemplatePreviewPoster(assetId, version)}${query}`,
  };
}

/** The C10 client for client components. */
export const browserStudioClient: StudioClient = createStudioClient(browserTransport);
