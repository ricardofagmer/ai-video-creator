'use client';

import { type ReferenceAnalysisView } from '@studio/shared/api';
import { useCallback, useEffect, useRef, useState } from 'react';
import { waitFor } from '@/features/common/wait-for';
import { usePageVisible } from '@/features/runs/hooks/usePageVisible';
import { isAbort } from '@/features/runs/run-error-text';
import { browserStudioClient } from '@/lib/api';
import { REFERENCE_ANALYSIS_POLL_INTERVAL_MS, REFERENCE_ANALYSIS_WAIT_MAX_MS, analysisIsWaiting } from '../reference-analysis-state';

export interface ReferenceAnalysisTarget {
  assetId: string;
  version: number;
  /** The view the server read for the page; null when that read failed. */
  initialView: ReferenceAnalysisView | null;
}

export interface ReferenceAnalysisLive {
  view: ReferenceAnalysisView | null;
  /** The last call failed (the view shown, if any, is the last one read). */
  error: unknown;
  waitedTooLong: boolean;
  /** A POST or a manual re-read is on its way. */
  busy: boolean;
  /** POST: asks the AI to analyse this version (again). */
  request: () => void;
  /** GET once: after a failed read. */
  reload: () => void;
}

/**
 * The reference analysis of one version, read again every 3 s while it is requested or running
 * and the tab is visible, for at most about 5 min (then the card says to come back later).
 */
export function useReferenceAnalysis({ assetId, version, initialView }: ReferenceAnalysisTarget): ReferenceAnalysisLive {
  const visible = usePageVisible();
  const [view, setView] = useState<ReferenceAnalysisView | null>(initialView);
  const [error, setError] = useState<unknown>(null);
  const [waitedTooLong, setWaitedTooLong] = useState(false);
  const [busy, setBusy] = useState(false);
  const waitStartedAtRef = useRef(Date.now());
  const callRef = useRef<AbortController | null>(null);
  const waiting = analysisIsWaiting(view);

  useEffect(() => () => callRef.current?.abort(), []);

  useEffect(() => {
    if (!waiting || !visible || waitedTooLong || error !== null) return undefined;
    const controller = new AbortController();
    const loop = async (): Promise<void> => {
      try {
        let next: ReferenceAnalysisView;
        do {
          await waitFor(REFERENCE_ANALYSIS_POLL_INTERVAL_MS, controller.signal);
          next = await browserStudioClient.getReferenceAnalysis(assetId, version, controller.signal);
          setView(next);
          if (analysisIsWaiting(next) && Date.now() - waitStartedAtRef.current >= REFERENCE_ANALYSIS_WAIT_MAX_MS) {
            setWaitedTooLong(true);
            return;
          }
        } while (analysisIsWaiting(next));
      } catch (caught) {
        if (isAbort(caught) || controller.signal.aborted) return;
        setError(caught);
      }
    };
    void loop();
    return () => controller.abort();
  }, [waiting, visible, waitedTooLong, error, assetId, version]);

  const call = useCallback(
    async (send: (signal: AbortSignal) => Promise<ReferenceAnalysisView>): Promise<void> => {
      callRef.current?.abort();
      const controller = new AbortController();
      callRef.current = controller;
      setBusy(true);
      try {
        const next = await send(controller.signal);
        waitStartedAtRef.current = Date.now();
        setView(next);
        setError(null);
        setWaitedTooLong(false);
      } catch (caught) {
        if (isAbort(caught) || controller.signal.aborted) return;
        setError(caught);
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    },
    [],
  );

  const request = useCallback(
    () => void call((signal) => browserStudioClient.requestReferenceAnalysis(assetId, version, signal)),
    [call, assetId, version],
  );
  const reload = useCallback(
    () => void call((signal) => browserStudioClient.getReferenceAnalysis(assetId, version, signal)),
    [call, assetId, version],
  );

  return { view, error, waitedTooLong, busy, request, reload };
}
