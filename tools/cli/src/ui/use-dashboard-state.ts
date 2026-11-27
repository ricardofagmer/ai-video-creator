import { useCallback, useEffect, useRef, useState } from 'react';
import { type RunId } from '@studio/shared/run-format';
import { toErrorReport } from '../errors/error-report.js';
import { cliText } from '../i18n/messages.js';
import { listRecentRuns, type RecentRuns, type RunSnapshot } from '../runs/run-reader.js';
import { type RunControlKind } from '../commands/run-control.command.js';

/** Same window as `studio status`: the newest runs, read from their folders. */
export const DASHBOARD_RUN_LIMIT = 20;
/** Files are re-read once a second; the watcher writes now.json at its own pace (C5). */
export const DASHBOARD_POLL_MS = 1000;

export type ControlRequester = (kind: RunControlKind, runId: RunId) => Promise<string>;

export type DashboardNotice = { tone: 'info' | 'error'; text: string } | null;

export interface DashboardModel {
  recent: RecentRuns | null;
  selectedIndex: number;
  selected: RunSnapshot | null;
  loadError: string | null;
  notice: DashboardNotice;
  busy: boolean;
  moveSelection: (delta: number) => void;
  requestControl: (kind: RunControlKind) => void;
}

function clampIndex(index: number, count: number): number {
  if (count === 0) return 0;
  return Math.min(Math.max(index, 0), count - 1);
}

/**
 * Dashboard state: polls run folders through C5 (no api, no database for reading) and sends
 * pause/stop/resume through `requestControl`, which reaches core `RequestRunControlCommand`.
 */
export function useDashboardState(runsRoot: string, control: ControlRequester): DashboardModel {
  const [recent, setRecent] = useState<RecentRuns | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<DashboardNotice>(null);
  const [busy, setBusy] = useState(false);
  const loading = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      // A slow disk must not stack reads: a tick that finds the previous read running is skipped.
      if (loading.current) return;
      loading.current = true;
      try {
        const next = await listRecentRuns(runsRoot, DASHBOARD_RUN_LIMIT);
        if (cancelled) return;
        setRecent(next);
        setLoadError(null);
      } catch (error) {
        if (!cancelled) setLoadError(toErrorReport(error).message);
      } finally {
        loading.current = false;
      }
    };
    void load();
    const timer = setInterval(() => void load(), DASHBOARD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [runsRoot]);

  const count = recent?.results.length ?? 0;
  const index = clampIndex(selectedIndex, count);
  const result = recent?.results[index];
  const selected = result?.status === 'read' ? result.snapshot : null;

  const moveSelection = useCallback((delta: number) => setSelectedIndex((current) => clampIndex(current + delta, count)), [count]);

  const requestControl = useCallback(
    (kind: RunControlKind) => {
      if (busy || selected === null) return;
      setBusy(true);
      setNotice({ tone: 'info', text: cliText().runs.dashboard.sending });
      control(kind, selected.runId)
        .then((text) => setNotice({ tone: 'info', text }))
        .catch((error: unknown) => setNotice({ tone: 'error', text: toErrorReport(error).message }))
        .finally(() => setBusy(false));
    },
    [busy, control, selected],
  );

  return { recent, selectedIndex: index, selected, loadError, notice, busy, moveSelection, requestControl };
}
