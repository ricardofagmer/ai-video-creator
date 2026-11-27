'use client';

import { type TemplatePreviewView } from '@studio/shared/api';
import { useEffect, useState } from 'react';
import { waitFor } from '@/features/common/wait-for';
import { isAbort } from '@/features/runs/run-error-text';
import { browserStudioClient } from '@/lib/api';

/** Between reads while the watcher renders; a render takes tens of seconds. */
const POLL_INTERVAL_MS = 3000;
/** Stops asking after this long; the job's own timeout is 5 min and it may wait in the queue first. */
const POLL_LIMIT_MS = 10 * 60 * 1000;

export type TemplatePreviewPhase =
  | { kind: 'loading' }
  | { kind: 'rendering' }
  | { kind: 'ready'; cacheKey: string }
  /** No clip to show: unsupported template, failed render, or the api could not be read. */
  | { kind: 'absent' };

function phaseOf(view: TemplatePreviewView): TemplatePreviewPhase {
  if (view.unavailable !== null) return { kind: 'absent' };
  if (view.status === 'done') return { kind: 'ready', cacheKey: view.updatedAt ?? '' };
  if (view.status === 'requested' || view.status === 'running') return { kind: 'rendering' };
  return { kind: 'absent' };
}

/**
 * Reads a template version's preview state and follows it while the watcher renders it (requested on
 * register, or by the api's backfill). One loop per card, aborted on unmount.
 */
export function useTemplatePreview(assetId: string, version: number): TemplatePreviewPhase {
  const [phase, setPhase] = useState<TemplatePreviewPhase>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    const since = Date.now();
    const follow = async (): Promise<void> => {
      try {
        let next = phaseOf(await browserStudioClient.getTemplatePreview(assetId, version, controller.signal));
        setPhase(next);
        while (next.kind === 'rendering' && Date.now() - since < POLL_LIMIT_MS) {
          await waitFor(POLL_INTERVAL_MS, controller.signal);
          next = phaseOf(await browserStudioClient.getTemplatePreview(assetId, version, controller.signal));
          setPhase(next);
        }
      } catch (error) {
        if (isAbort(error) || controller.signal.aborted) return;
        // A preview is decoration: an unreadable state leaves the card's glyph cover.
        setPhase({ kind: 'absent' });
      }
    };
    void follow();
    return () => controller.abort();
  }, [assetId, version]);

  return phase;
}
