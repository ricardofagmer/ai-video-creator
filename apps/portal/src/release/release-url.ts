const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost']);

/**
 * Release addresses are https only: the manifest names the executables people download and their
 * SHA-256. The single exception is `next dev`, which also accepts plain http on this computer's
 * loopback so a locally built installer can be previewed (scripts/release/serve-local-release.mjs).
 * Next inlines `NODE_ENV` at build, so an exported production portal never takes the exception.
 */
export function isReleaseUrlAllowed(value: string, mode: string | undefined = process.env.NODE_ENV): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username !== '' || url.password !== '') return false;
  if (url.protocol === 'https:') return true;
  return mode === 'development' && url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
}
