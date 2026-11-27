import type { SessionResponse } from '@studio/shared/api';
import { AppShell, Logo, THEME_COOKIE_NAME, ThemeToggle, formatDateTime, parseThemePreference } from '@studio/ui';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { CartButton } from '@/features/cart/components/CartButton';
import { HelpButton } from '@/features/shell/HelpButton';
import { LanguageControl } from '@/features/shell/LanguageControl';
import { LogoutButton } from '@/features/shell/LogoutButton';
import { StudioNavigation } from '@/features/shell/StudioNavigation';
import { ApiUnreachableError } from '@/lib/api';
import { serverStudioClient } from '@/lib/api/server';
import { getI18n } from '@/lib/i18n/server';

async function requireSession(): Promise<SessionResponse> {
  try {
    // 401 redirects to /login with the "sessão terminou" notice (server transport).
    return await serverStudioClient().session();
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
  const session = await requireSession();
  const themePreference = parseThemePreference((await cookies()).get(THEME_COOKIE_NAME)?.value);
  const { locale, t } = await getI18n();

  return (
    <AppShell
      brand={
        <Link href="/execucoes" aria-label={t.shell.brandLink}>
          <Logo compactBelowMd />
        </Link>
      }
      navigation={<StudioNavigation />}
      rail={<StudioNavigation variant="rail" />}
      status={
        <>
          {watcher}
          <CartButton />
          <HelpButton />
          <LanguageControl />
          <ThemeToggle initialPreference={themePreference} />
        </>
      }
      account={{
        name: t.shell.account.name,
        detail: t.shell.account.sessionUntil(formatDateTime(session.expiresAt, locale)),
        menu: <LogoutButton />,
      }}
    >
      {children}
    </AppShell>
  );
}
