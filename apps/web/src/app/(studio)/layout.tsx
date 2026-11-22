import { AppShell, Logo, THEME_COOKIE_NAME, ThemeToggle, parseThemePreference } from '@studio/ui';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { LogoutButton } from '@/features/shell/LogoutButton';
import { StudioNavigation } from '@/features/shell/StudioNavigation';
import { ApiUnreachableError } from '@/lib/api';
import { serverStudioClient } from '@/lib/api/server';

async function requireSession(): Promise<void> {
  try {
    // 401 redirects to /login with the "sessão terminou" notice (server transport).
    await serverStudioClient().session();
  } catch (error) {
    if (error instanceof ApiUnreachableError) redirect('/login');
    throw error;
  }
}

interface StudioLayoutProps {
  children: ReactNode;
  /** Parallel route `@watcher`: the WatcherIndicator slot that R1-20 fills. */
  watcher: ReactNode;
}

/** design/telas/01, block 1: the private shell around every page except `/login`. */
export default async function StudioLayout({ children, watcher }: StudioLayoutProps) {
  await requireSession();
  const themePreference = parseThemePreference((await cookies()).get(THEME_COOKIE_NAME)?.value);
  return (
    <AppShell
      brand={
        <Link href="/execucoes" aria-label="EngineOS Video Creator, ir para Execuções">
          <Logo />
        </Link>
      }
      navigation={<StudioNavigation />}
      status={watcher}
      actions={
        <>
          <ThemeToggle initialPreference={themePreference} />
          <LogoutButton />
        </>
      }
    >
      {children}
    </AppShell>
  );
}
