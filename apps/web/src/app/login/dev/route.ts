import {
  DEV_AUTO_LOGIN_FAILED_REASON,
  devAutoLoginPassphrase,
  signInWithDevPassphrase,
} from '@/features/auth/dev-auto-login';
import { fetchSiteAllowed } from '@/lib/bff/fetch-site';

// Node runtime: the server transport is `server-only` and reads the session cookie.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** Relative `Location`, so the cookie and the next page stay on the host the owner typed. */
function seeOther(location: string, sessionCookie?: string): Response {
  const headers = new Headers({ ...NO_STORE, Location: location });
  if (sessionCookie !== undefined) headers.append('Set-Cookie', sessionCookie);
  return new Response(null, { status: 303, headers });
}

/**
 * `GET /login/dev`: development-only auto sign-in (docs/specs/2026-11-22-dev-auto-sign-in-design.md).
 * Off, it does not exist (404). On, it signs in with the passphrase from `.env.local` and lands on
 * `/execucoes`; any failure goes back to `/login` with a reason that stops further redirects.
 */
export async function GET(request: Request): Promise<Response> {
  const passphrase = devAutoLoginPassphrase();
  if (passphrase === null) return new Response(null, { status: 404, headers: NO_STORE });
  // Same Fetch Metadata rule as the BFF: the web's own pages or the address bar only.
  if (!fetchSiteAllowed(request.headers.get('sec-fetch-site'))) return new Response(null, { status: 403, headers: NO_STORE });

  const result = await signInWithDevPassphrase(passphrase);
  if (result.kind === 'signed-in') return seeOther('/execucoes', result.sessionCookie);
  // The reason is a status or an error name; never the passphrase, a cookie or a body.
  process.stderr.write(`${JSON.stringify({ event: 'web.dev-auto-login.failed', reason: result.reason })}\n`);
  return seeOther(`/login?motivo=${DEV_AUTO_LOGIN_FAILED_REASON}`);
}
