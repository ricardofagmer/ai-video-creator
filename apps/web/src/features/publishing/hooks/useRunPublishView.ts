'use client';

import { type PublishAttemptView, type RunPublishView } from '@studio/shared/api';
import { isOpenPublishState } from '@studio/shared/platforms';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePageVisible } from '@/features/runs/hooks/usePageVisible';
import { isAbort } from '@/features/runs/run-error-text';
import { browserPublishingApi } from '../publishing-api';

/** Section 5.4: `GET /runs/:runId/publish` every 2 s while an attempt is open. */
const PUBLISH_POLL_INTERVAL_MS = 2000;

export interface RunPublishLive {
  view: RunPublishView;
  /** The last poll failed; the view shown is the last one read. */
  unreachable: boolean;
  /** An attempt is open and the tab is visible, so the view is being polled. */
  polling: boolean;
  /** Puts the attempt a publish or cancel call answered into the view, which (re)starts polling. */
  applyAttempt: (attempt: PublishAttemptView) => void;
}

function hasOpenAttempt(view: RunPublishView): boolean {
  return view.attempts.some((attempt) => isOpenPublishState(attempt.state));
}

function withAttempt(view: RunPublishView, attempt: PublishAttemptView): RunPublishView {
  const others = view.attempts.filter((existing) => existing.attemptId !== attempt.attemptId);
  return { ...view, attempts: [attempt, ...others].sort((left, right) => right.requestedAt.localeCompare(left.requestedAt)) };
}

interface LiveState {
  /** The server-rendered view this state was last reset from. */
  source: RunPublishView;
  view: RunPublishView;
  unreachable: boolean;
}

/**
 * The publish view of an approved run, polled while an attempt is open (section 5.4). One loop, no
 * overlap; it stops when the tab is hidden and when no attempt is open. When the last open attempt
 * ends, the server parts of the page are refreshed so "Publicações" shows the new publication.
 */
export function useRunPublishView(runId: string, initialView: RunPublishView): RunPublishLive {
  const router = useRouter();
  const visible = usePageVisible();
  const [live, setLive] = useState<LiveState>({ source: initialView, view: initialView, unreachable: false });
  let current = live;
  if (live.source !== initialView) {
    // A server refresh brought a newer view: adopt it (React's "adjust state on prop change").
    current = { source: initialView, view: initialView, unreachable: false };
    setLive(current);
  }
  const open = hasOpenAttempt(current.view);
  const wasOpenRef = useRef(open);

  useEffect(() => {
    if (wasOpenRef.current && !open) router.refresh();
    wasOpenRef.current = open;
  }, [open, router]);

  const pollOnce = useCallback(
    async (signal: AbortSignal): Promise<boolean> => {
      try {
        const view = await browserPublishingApi.getRunPublish(runId, signal);
        if (signal.aborted) return false;
        setLive((previous) => ({ ...previous, view, unreachable: false }));
        return hasOpenAttempt(view);
      } catch (error) {
        if (isAbort(error) || signal.aborted) return false;
        setLive((previous) => ({ ...previous, unreachable: true }));
        return true;
      }
    },
    [runId],
  );

  useEffect(() => {
    if (!visible || !open) return undefined;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = async (): Promise<void> => {
      const keepPolling = await pollOnce(controller.signal);
      if (keepPolling && !controller.signal.aborted) timer = setTimeout(() => void loop(), PUBLISH_POLL_INTERVAL_MS);
    };
    timer = setTimeout(() => void loop(), PUBLISH_POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [visible, open, pollOnce]);

  const applyAttempt = useCallback((attempt: PublishAttemptView) => {
    setLive((previous) => ({ ...previous, view: withAttempt(previous.view, attempt) }));
  }, []);

  return { view: current.view, unreachable: current.unreachable, polling: visible && open, applyAttempt };
}
