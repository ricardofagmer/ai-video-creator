import { type VoiceSampleView } from '@studio/shared/api';
import { type AssetJobErrorCode } from '@studio/shared/asset-jobs';

/** Guided-creation spec section 2: poll the sample about every 1.5 s, give up after about 2 min. */
export const VOICE_SAMPLE_POLL_INTERVAL_MS = 1500;
export const VOICE_SAMPLE_WAIT_MAX_MS = 120_000;

/** Why there is no clip to play. `job` is the api's own answer; the others happen in the browser. */
export type VoiceSampleProblem =
  | { kind: 'job'; code: AssetJobErrorCode | null }
  | { kind: 'waited-too-long' }
  | { kind: 'api'; error: unknown }
  | { kind: 'audio' };

export type VoiceSamplePhase =
  | { kind: 'idle' }
  | { kind: 'generating'; since: number }
  | { kind: 'ready'; cacheKey: string; mock: boolean }
  | { kind: 'failed'; problem: VoiceSampleProblem };

export interface PhaseFromViewOptions {
  view: VoiceSampleView;
  /** When this wait started (ms since epoch). */
  since: number;
  now: number;
}

/** The phase one sample view puts the button in. */
export function phaseFromView({ view, since, now }: PhaseFromViewOptions): VoiceSamplePhase {
  switch (view.status) {
    case 'done':
      if (view.audio === null) return { kind: 'failed', problem: { kind: 'job', code: 'output-invalid' } };
      // updatedAt changes when a sample is replaced, so the browser fetches the new clip.
      return { kind: 'ready', cacheKey: view.updatedAt ?? '', mock: view.mode === 'mock' };
    case 'requested':
    case 'running':
      if (now - since >= VOICE_SAMPLE_WAIT_MAX_MS) return { kind: 'failed', problem: { kind: 'waited-too-long' } };
      return { kind: 'generating', since };
    case 'failed':
    case 'refused':
      return { kind: 'failed', problem: { kind: 'job', code: view.errorCode } };
    case 'none':
      return { kind: 'failed', problem: { kind: 'job', code: null } };
  }
}

/** True while the loop must read the sample again. */
export function keepsWaiting(phase: VoiceSamplePhase): boolean {
  return phase.kind === 'generating';
}

/**
 * Whether "Tentar de novo" sends `replace: true`. A failed or refused job is replaced by the api
 * anyway; replace is still sent so a kept clip that would not play is regenerated too.
 */
export function retryReplaces(problem: VoiceSampleProblem): boolean {
  return problem.kind === 'job' || problem.kind === 'audio';
}
