'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { usePageVisible } from '../hooks/usePageVisible';
import { POLL_INTERVAL_MS } from '../hooks/useRunLive';

interface RunListAutoRefreshProps {
  /** Some run on the page is not terminal (design/telas/07). */
  active: boolean;
}

/**
 * Re-renders the server list every 1 s (A17) while a run on the page is live and the tab is
 * visible. A refresh keeps client state and focus; only the changed cells update.
 */
export function RunListAutoRefresh({ active }: RunListAutoRefreshProps): null {
  const router = useRouter();
  const visible = usePageVisible();

  useEffect(() => {
    if (!active || !visible) return undefined;
    const timer = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, visible, router]);

  return null;
}
