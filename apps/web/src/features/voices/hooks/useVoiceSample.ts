'use client';

import { type Language } from '@studio/shared/recipes';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { isAbort } from '@/features/runs/run-error-text';
import { waitFor } from '@/features/common/wait-for';
import { browserStudioClient, voiceSampleAudioUrl } from '@/lib/api';
import { claimPlayback, releasePlayback } from '../exclusive-playback';
import {
  VOICE_SAMPLE_POLL_INTERVAL_MS,
  keepsWaiting,
  phaseFromView,
  retryReplaces,
  type VoiceSamplePhase,
} from '../voice-sample-state';

export interface VoiceSampleTarget {
  assetId: string;
  version: number;
  language: Language;
}

export interface VoiceSampleAudioProps {
  ref: RefObject<HTMLAudioElement | null>;
  src: string | undefined;
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onError: () => void;
}

export interface VoiceSampleControl {
  phase: VoiceSamplePhase;
  playing: boolean;
  /** The one button: asks for the sample, retries it, or plays and pauses the clip. */
  press: () => void;
  audio: VoiceSampleAudioProps;
}

/**
 * Asks the api for a voice's sample, waits for it (POST, then GET every 1.5 s for at most about
 * 2 min) and plays it in the page's single `<audio>` per button. One loop at a time; it is aborted
 * on unmount and when a new request replaces it.
 */
export function useVoiceSample({ assetId, version, language }: VoiceSampleTarget): VoiceSampleControl {
  const [phase, setPhase] = useState<VoiceSamplePhase>({ kind: 'idle' });
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  // The owner pressed "Ouvir": play as soon as the clip is ready, not only on a second press.
  const playWhenReadyRef = useRef(false);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      controllerRef.current?.abort();
      if (audio !== null) {
        audio.pause();
        releasePlayback(audio);
      }
    };
  }, []);

  const follow = useCallback(
    async (replace: boolean): Promise<void> => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const since = Date.now();
      playWhenReadyRef.current = true;
      setPhase({ kind: 'generating', since });
      try {
        const request = replace ? { language, replace: true } : { language };
        let view = await browserStudioClient.requestVoiceSample(assetId, version, request, controller.signal);
        let next = phaseFromView({ view, since, now: Date.now() });
        while (keepsWaiting(next)) {
          await waitFor(VOICE_SAMPLE_POLL_INTERVAL_MS, controller.signal);
          view = await browserStudioClient.getVoiceSample(assetId, version, controller.signal);
          next = phaseFromView({ view, since, now: Date.now() });
        }
        setPhase(next);
      } catch (error) {
        if (isAbort(error) || controller.signal.aborted) return;
        setPhase({ kind: 'failed', problem: { kind: 'api', error } });
      }
    },
    [assetId, version, language],
  );

  const play = useCallback((): void => {
    const audio = audioRef.current;
    if (audio === null) return;
    claimPlayback(audio);
    // A refused play() (the browser's autoplay rule after the wait) leaves the clip ready: the
    // next press plays it. A broken clip reports through the element's own error event instead.
    audio.play().catch(() => setPlaying(false));
  }, []);

  useEffect(() => {
    if (phase.kind !== 'ready' || !playWhenReadyRef.current) return;
    playWhenReadyRef.current = false;
    play();
  }, [phase, play]);

  const press = useCallback((): void => {
    switch (phase.kind) {
      case 'idle':
        void follow(false);
        return;
      case 'generating':
        return;
      case 'failed':
        void follow(retryReplaces(phase.problem));
        return;
      case 'ready': {
        const audio = audioRef.current;
        if (audio !== null && !audio.paused) audio.pause();
        else play();
      }
    }
  }, [phase, follow, play]);

  const audio: VoiceSampleAudioProps = {
    ref: audioRef,
    src: phase.kind === 'ready' ? voiceSampleAudioUrl(assetId, version, phase.cacheKey) : undefined,
    onPlay: () => {
      if (audioRef.current !== null) claimPlayback(audioRef.current);
      setPlaying(true);
    },
    onPause: () => setPlaying(false),
    onEnded: () => {
      setPlaying(false);
      if (audioRef.current !== null) releasePlayback(audioRef.current);
    },
    onError: () => {
      setPlaying(false);
      setPhase({ kind: 'failed', problem: { kind: 'audio' } });
    },
  };

  return { phase, playing, press, audio };
}
