'use client';

import { WatcherIndicator, useI18n, type WatcherState } from '@studio/ui';
import { type WatcherStatusResponse } from '@studio/shared/api';
import { WATCHER_HEARTBEAT_INTERVAL_MS } from '@studio/shared/run-format';
import { useEffect, useState, type ReactElement } from 'react';
import { browserStudioClient } from '@/lib/api';
import { useWebMessages } from '@/lib/i18n/client';
import { usePageVisible } from '../hooks/usePageVisible';
import { isAbort } from '../run-error-text';
import { formatTime } from '../run-labels';

/** What the top bar shows: the indicator state and, for a stopped watcher, when it was last seen. */
interface ShellWatcherView {
  state: WatcherState;
  lastSeenAt: string | null;
}

const UNKNOWN_VIEW: ShellWatcherView = { state: 'unknown', lastSeenAt: null };

/**
 * `GET /watcher` (SPEC 0002 rev 4, section 13.3): `alive` is "Watcher ativo"; `dead` and `absent`
 * are "Watcher parado". The api judges the heartbeat file; the web never infers it from runs.
 */
function viewOf(status: WatcherStatusResponse): ShellWatcherView {
  if (status.state === 'alive') return { state: 'running', lastSeenAt: null };
  return { state: 'stopped', lastSeenAt: status.lastSeenAt };
}

/**
 * design/telas/01: watcher state in the top bar. Polled at the heartbeat cadence (2 s) while the
 * tab is visible; no api answer shows "Watcher sem resposta".
 */
export function ShellWatcherIndicator(): ReactElement {
  const visible = usePageVisible();
  const t = useWebMessages().runs.run;
  const { locale } = useI18n();
  const [view, setView] = useState<ShellWatcherView>(UNKNOWN_VIEW);

  useEffect(() => {
    if (!visible) return undefined;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = async (): Promise<void> => {
      try {
        const status = await browserStudioClient.watcherStatus(controller.signal);
        if (!controller.signal.aborted) setView(viewOf(status));
      } catch (error) {
        if (isAbort(error) || controller.signal.aborted) return;
        setView(UNKNOWN_VIEW);
      }
      if (!controller.signal.aborted) timer = setTimeout(() => void loop(), WATCHER_HEARTBEAT_INTERVAL_MS);
    };
    void loop();
    return () => {
      controller.abort();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [visible]);

  return (
    <>
      <WatcherIndicator state={view.state} />
      {view.lastSeenAt !== null && <span className="caption">{t.watcherLastSeen(formatTime(Date.parse(view.lastSeenAt), locale))}</span>}
    </>
  );
}
