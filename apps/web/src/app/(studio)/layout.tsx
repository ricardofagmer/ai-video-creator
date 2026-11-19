import { AppShell, Logo } from '@studio/ui';
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
  return (
    <AppShell
      brand={
        <Link href="/execucoes" aria-label="Video Studio, ir para Execuções">
          <Logo />
        </Link>
      }
      navigation={<StudioNavigation />}
      status={watcher}
      actions={<LogoutButton />}
    >
      {children}
    </AppShell>
  );
}
