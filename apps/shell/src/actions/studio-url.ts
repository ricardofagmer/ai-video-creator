/** The web binds loopback only (PRD 12); this is the one origin the shell hands to the browser. */
const LOOPBACK_HOST = '127.0.0.1';

/**
 * `http://127.0.0.1:<webPort>/`, built from the bundled configuration's port and nothing else: no
 * file content, menu text or argument can change the host, path or scheme.
 */
export function studioUrl(webPort: number): string {
  if (!Number.isInteger(webPort) || webPort < 1024 || webPort > 65535) throw new RangeError('web port out of range');
  return `http://${LOOPBACK_HOST}:${webPort}/`;
}
