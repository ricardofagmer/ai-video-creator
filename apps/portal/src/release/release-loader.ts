import type { ReleaseManifestLocation } from '@/config/portal-config';
import { ReleaseManifestSchema, type ReleaseManifest } from './release-manifest';

/** Where the downloads section stands. No state ever invents a version, a link or a checksum. */
export type ReleaseState =
  | { kind: 'not-configured' }
  | { kind: 'loading' }
  | { kind: 'ready'; manifest: ReleaseManifest }
  | { kind: 'failed' };

export type ManifestFetch = (url: string, init: RequestInit) => Promise<Response>;

/** The browser's `fetch`, bound to the window. */
export const browserManifestFetch: ManifestFetch = (url, init) => fetch(url, init);

/**
 * Reads `latest.json`. A plain GET with no query, no body, no cookie and no referrer: nothing
 * about this computer travels to the release host (DI-AC-21).
 */
export async function loadReleaseManifest(
  location: ReleaseManifestLocation,
  options: { fetch: ManifestFetch; signal?: AbortSignal },
): Promise<ReleaseState> {
  if (location.kind !== 'configured') return { kind: 'not-configured' };
  let response: Response;
  try {
    response = await options.fetch(location.url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: options.signal,
    });
  } catch {
    return { kind: 'failed' };
  }
  if (!response.ok) return { kind: 'failed' };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { kind: 'failed' };
  }
  const parsed = ReleaseManifestSchema.safeParse(body);
  return parsed.success ? { kind: 'ready', manifest: parsed.data } : { kind: 'failed' };
}
