'use client';

import { Icon, Spinner, drawerItemClassName } from '@studio/ui';
import { useRouter } from 'next/navigation';
import { useState, type ReactElement } from 'react';
import { browserStudioClient, isUnauthorized } from '@/lib/api';
import { useWebMessages } from '@/lib/i18n/client';

/** design/telas/01: the "Sair" row of the drawer's account menu. The api clears the httpOnly cookie. */
export function LogoutButton(): ReactElement {
  const t = useWebMessages();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout(): Promise<void> {
    setPending(true);
    try {
      await browserStudioClient.logout();
    } catch (error) {
      // An already expired session is a completed logout; anything else keeps the owner here.
      if (!isUnauthorized(error)) {
        setPending(false);
        return;
      }
    }
    router.replace('/login');
    router.refresh();
  }

  return (
    <button
      type="button"
      className={drawerItemClassName()}
      disabled={pending}
      aria-busy={pending ? true : undefined}
      onClick={() => void handleLogout()}
    >
      {pending ? <Spinner size="sm" decorative /> : <Icon name="log-out" />}
      <span>{t.shell.logout}</span>
    </button>
  );
}
