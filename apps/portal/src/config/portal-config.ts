/**
 * Build-time configuration of the portal. Every value is public (it ships in the static bundle)
 * and none is a secret. Next inlines `process.env.NEXT_PUBLIC_*` only when the name is written
 * out in full, so the raw reads stay in `readPortalConfig` and the parsing is a pure function.
 */

import { isReleaseUrlAllowed } from '@/release/release-url';

/** Port of the local api (C1); the studio's default. */
export const DEFAULT_API_PORT = 4311;
/** Port of the local web ("Open studio"); the studio's default. */
export const DEFAULT_STUDIO_PORT = 4310;

/** The release manifest URL is either a valid https URL or explicitly absent; never a guess. */
export type ReleaseManifestLocation =
  | { kind: 'configured'; url: string; origin: string }
  | { kind: 'not-configured' }
  | { kind: 'invalid' };

export interface PortalConfig {
  /** `http://127.0.0.1:<api port>`, the only host that ever sees a pairing code or a token. */
  apiOrigin: string;
  /** `http://127.0.0.1:<web port>`, opened by a plain link, never fetched. */
  studioUrl: string;
  releaseManifest: ReleaseManifestLocation;
}

export interface RawPortalConfig {
  apiPort: string | undefined;
  studioPort: string | undefined;
  releaseManifestUrl: string | undefined;
}

const LOOPBACK_IP = '127.0.0.1';
const MAX_PORT = 65535;

function parsePort(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  if (!/^[0-9]{1,5}$/.test(raw.trim())) return fallback;
  const port = Number.parseInt(raw.trim(), 10);
  return port >= 1 && port <= MAX_PORT ? port : fallback;
}

function parseManifestUrl(raw: string | undefined): ReleaseManifestLocation {
  if (raw === undefined || raw.trim() === '') return { kind: 'not-configured' };
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { kind: 'invalid' };
  }
  // https only (loopback http under `next dev`): the manifest names the executables people download and their SHA-256.
  if (!isReleaseUrlAllowed(url.toString())) return { kind: 'invalid' };
  return { kind: 'configured', url: url.toString(), origin: url.origin };
}

/** Pure: turns raw build-time strings into a configuration (an invalid port falls back to the default). */
export function parsePortalConfig(raw: RawPortalConfig): PortalConfig {
  const apiPort = parsePort(raw.apiPort, DEFAULT_API_PORT);
  const studioPort = parsePort(raw.studioPort, DEFAULT_STUDIO_PORT);
  return {
    apiOrigin: `http://${LOOPBACK_IP}:${apiPort}`,
    studioUrl: `http://${LOOPBACK_IP}:${studioPort}`,
    releaseManifest: parseManifestUrl(raw.releaseManifestUrl),
  };
}

/** Reads the three public build-time variables (inlined by Next at build). */
export function readPortalConfig(): PortalConfig {
  return parsePortalConfig({
    apiPort: process.env.NEXT_PUBLIC_ENGINEOS_VIDEO_CREATOR_API_PORT,
    studioPort: process.env.NEXT_PUBLIC_ENGINEOS_VIDEO_CREATOR_WEB_PORT,
    releaseManifestUrl: process.env.NEXT_PUBLIC_ENGINEOS_VIDEO_CREATOR_RELEASE_MANIFEST_URL,
  });
}

/**
 * Content-Security-Policy for the `<meta>` tag. `connect-src` is the browser-enforced form of
 * DI-AC-21: the page can only reach itself, the local api and the manifest origin. Next's static
 * export inlines its bootstrap scripts, hence `'unsafe-inline'` for scripts; there is no
 * third-party script, font or image to allow.
 */
export function contentSecurityPolicy(config: PortalConfig, mode: 'production' | 'development' = 'production'): string {
  const connect = ["'self'", config.apiOrigin];
  if (config.releaseManifest.kind === 'configured') connect.push(config.releaseManifest.origin);
  // `next dev` evaluates its refresh runtime; the exported build never needs eval.
  const script = mode === 'development' ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'";
  return [
    "default-src 'self'",
    script,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connect.join(' ')}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}
