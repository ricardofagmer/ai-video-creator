/** Loopback only: the studio's web and api never listen elsewhere (PRD 12, criterion 23). */
const LOOPBACK_HOST = '127.0.0.1';
const PROBE_TIMEOUT_MS = 2000;
/** The health body is a few bytes; anything larger is not the studio api. */
const MAX_BODY_CHARS = 4096;

export type HttpProbe =
  | { status: 'up'; httpStatus: number; body: unknown }
  | { status: 'down'; reason: 'refused' | 'timeout' | 'error' };

export function loopbackUrl(port: number, path: string): string {
  return `http://${LOOPBACK_HOST}:${port}${path}`;
}

async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length > MAX_BODY_CHARS) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    // A non-JSON body (the web's HTML page) is still a live server; there is no body to report.
    return null;
  }
}

function failureReason(error: unknown): 'refused' | 'timeout' | 'error' {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return 'timeout';
  const cause = error instanceof Error ? error.cause : undefined;
  if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'ECONNREFUSED') return 'refused';
  return 'error';
}

/**
 * One GET to `127.0.0.1:<port><path>`, no credentials, no redirects followed. Used by `doctor`
 * and by `start` to wait for a service; it never leaves the machine.
 */
export async function probeLoopback(port: number, path: string): Promise<HttpProbe> {
  try {
    const response = await fetch(loopbackUrl(port, path), { redirect: 'manual', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    return { status: 'up', httpStatus: response.status, body: await readJsonBody(response) };
  } catch (error) {
    return { status: 'down', reason: failureReason(error) };
  }
}
