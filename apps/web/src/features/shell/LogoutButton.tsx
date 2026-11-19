'use client';

import { Button } from '@studio/ui';
import { useRouter } from 'next/navigation';
import { useState, type ReactElement } from 'react';
import { browserStudioClient, isUnauthorized } from '@/lib/api';

/** design/telas/01: Button `ghost` `sm` "Sair". The api clears the httpOnly cookie. */
export function LogoutButton(): ReactElement {
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
    <Button variant="ghost" size="sm" loading={pending} onClick={() => void handleLogout()}>
      Sair
    </Button>
  );
}
