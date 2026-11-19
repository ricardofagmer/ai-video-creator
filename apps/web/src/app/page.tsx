import { redirect } from 'next/navigation';
import { serverStudioClient } from '@/lib/api/server';

export const dynamic = 'force-dynamic';

async function hasSession(): Promise<boolean> {
  try {
    await serverStudioClient('throw').session();
    return true;
  } catch {
    // No session, or the api is down: both land on /login, which explains either case.
    return false;
  }
}

/**
 * `/` never answers 5xx: the `studio` CLI (R1-21) treats any status below 500 here as "web ready".
 * Logged out (or api down) goes to `/login`; logged in goes to `/execucoes`, the home page after
 * login (design/telas/01).
 */
export default async function HomePage() {
  redirect((await hasSession()) ? '/execucoes' : '/login');
}
