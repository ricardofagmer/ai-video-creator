import 'server-only';
import { LoginRequestSchema, SESSION_COOKIE_NAME, apiPaths } from '@studio/shared/api';
import { serverTransport } from '@/lib/api/server';

/**
 * Development-only auto sign-in (docs/specs/2026-11-22-dev-auto-sign-in-design.md). The
 * passphrase is read here and in the route handler only, never sent to the browser and never
 * logged; production builds compile `devAutoLoginPassphrase` to `return null`.
 */

/** The route handler that signs in (`src/app/login/dev/route.ts`). */
export const DEV_AUTO_LOGIN_PATH = '/login/dev';
/** `motivo` the route sends the owner back with when the dev sign-in did not work. */
export const DEV_AUTO_LOGIN_FAILED_REASON = 'login-dev-falhou';
export const DEV_AUTO_LOGIN_FLAG_ENV_VAR = 'ENGINEOS_VIDEO_CREATOR_DEV_AUTO_LOGIN';
export const DEV_PASSPHRASE_ENV_VAR = 'ENGINEOS_VIDEO_CREATOR_DEV_PASSPHRASE';

/**
 * The passphrase to sign in with, or null when the dev auto sign-in is off. On only under
 * `next dev`, with the switch exactly `1` and a passphrase the login schema accepts; no fallback.
 */
export function devAutoLoginPassphrase(): string | null {
  // Literal read on purpose: Next inlines NODE_ENV, so `next build` turns this into `return null`.
  if (process.env.NODE_ENV !== 'development') return null;
  if (process.env[DEV_AUTO_LOGIN_FLAG_ENV_VAR] !== '1') return null;
  const parsed = LoginRequestSchema.safeParse({ passphrase: process.env[DEV_PASSPHRASE_ENV_VAR] });
  return parsed.success ? parsed.data.passphrase : null;
}

export function devAutoLoginEnabled(): boolean {
  return devAutoLoginPassphrase() !== null;
}

export type DevSignInResult =
  | { kind: 'signed-in'; sessionCookie: string }
  | { kind: 'failed'; reason: string };

/**
 * Signs in through the api's real `POST /auth/login` (argon2 check, throttle and Origin check
 * included) and returns the `studio_session` cookie it issued, verbatim.
 */
export async function signInWithDevPassphrase(passphrase: string): Promise<DevSignInResult> {
  let response: Response;
  try {
    response = await serverTransport('throw')({
      method: 'POST',
      path: apiPaths.login(),
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ passphrase }),
    });
  } catch (error) {
    return { kind: 'failed', reason: error instanceof Error ? error.name : 'unknown' };
  }
  await response.body?.cancel();
  if (!response.ok) return { kind: 'failed', reason: `status-${response.status}` };
  const sessionCookie = response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`));
  return sessionCookie === undefined ? { kind: 'failed', reason: 'no-session-cookie' } : { kind: 'signed-in', sessionCookie };
}
