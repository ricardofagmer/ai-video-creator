/*
 * Where the menu's portal entries point (desktop installer, ticket 07). Neither value has a
 * default: an unset or invalid value disables the entry it feeds and is never replaced by a guessed
 * URL (plan section 9.1). Both values are public addresses, never secrets.
 */

/** The hosted portal; the same name the api reads to scope CORS (plan section 2). */
export const PORTAL_ORIGIN_ENV_VAR = 'ENGINEOS_VIDEO_CREATOR_PORTAL_ORIGIN';
/** `latest.json` (contract C2 rev 2); the portal reads the same file at its public raw address. */
export const RELEASE_MANIFEST_URL_ENV_VAR = 'ENGINEOS_VIDEO_CREATOR_RELEASE_MANIFEST_URL';

const MAX_URL_CHARS = 2048;

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1']);

/**
 * Plan section 9.6 (owner decision 2026-11-23): a portal served by `next dev` on this computer,
 * `http://localhost:<port>` or `http://127.0.0.1:<port>`. Only a process on this machine can serve
 * that origin, and such a process can already call the loopback api directly. The packaging bakes
 * such an origin only on an explicit opt-in, never in the release workflow.
 */
export function isLocalPortalUrl(url: URL): boolean {
  return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname) && url.port !== '' && url.username === '' && url.password === '';
}

/** An https address the shell may use, or the reason it may not. */
export type HttpsSetting = { readonly kind: 'configured'; readonly url: string } | { readonly kind: 'not-configured' } | { readonly kind: 'invalid' };

export interface PortalSettings {
  /** Normalized origin (`https://host[:port]`), no path, query or fragment. */
  readonly portalOrigin: HttpsSetting;
  /** Absolute https URL of `latest.json`. */
  readonly releaseManifest: HttpsSetting;
}

function parseHttpsUrl(raw: string | undefined, allowLocalPortal = false): URL | 'not-configured' | 'invalid' {
  const trimmed = raw?.trim() ?? '';
  if (trimmed === '') return 'not-configured';
  if (trimmed.length > MAX_URL_CHARS) return 'invalid';
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return 'invalid';
  }
  // https only, no userinfo: the origin receives a pair code and the manifest names downloads.
  if (allowLocalPortal && isLocalPortalUrl(url)) return url;
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.hostname === '') return 'invalid';
  return url;
}

/**
 * Accepts `https://host[:port]`, or a local portal origin (`isLocalPortalUrl`), with at most a
 * trailing slash; anything else is invalid.
 */
export function parsePortalOrigin(raw: string | undefined): HttpsSetting {
  const url = parseHttpsUrl(raw, true);
  if (url === 'not-configured' || url === 'invalid') return { kind: url };
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') return { kind: 'invalid' };
  return { kind: 'configured', url: url.origin };
}

/** Accepts an absolute https URL with no fragment. */
export function parseReleaseManifestUrl(raw: string | undefined): HttpsSetting {
  const url = parseHttpsUrl(raw);
  if (url === 'not-configured' || url === 'invalid') return { kind: url };
  if (url.hash !== '') return { kind: 'invalid' };
  return { kind: 'configured', url: url.toString() };
}

/**
 * Pure: reads the two names from the shell's effective environment (development: the process
 * environment; packaged: the process environment over the bundled `portal-settings.json`).
 */
export function readPortalSettings(environment: Readonly<Record<string, string | undefined>>): PortalSettings {
  return {
    portalOrigin: parsePortalOrigin(environment[PORTAL_ORIGIN_ENV_VAR]),
    releaseManifest: parseReleaseManifestUrl(environment[RELEASE_MANIFEST_URL_ENV_VAR]),
  };
}

/**
 * The portal origin entry of a `studio` child's allowlisted environment: the CLI hands it to the api
 * only, which opens CORS for that one origin (apps/api `api-config.ts`). Only a valid, normalized
 * origin is passed, because the api refuses to start on an invalid one.
 */
export function portalOriginChildEnvironment(environment: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const origin = parsePortalOrigin(environment[PORTAL_ORIGIN_ENV_VAR]);
  return origin.kind === 'configured' ? { [PORTAL_ORIGIN_ENV_VAR]: origin.url } : {};
}
