import { type ReferenceAnalysisUnavailable, type ReferenceAnalysisView } from '@studio/shared/api';
import { type AssetJobErrorCode } from '@studio/shared/asset-jobs';
import { type ReferenceStyleAnalysis } from '@studio/shared/agents';

/** A video analysis takes longer than a voice sample: read it every 3 s, stop after about 5 min. */
export const REFERENCE_ANALYSIS_POLL_INTERVAL_MS = 3000;
export const REFERENCE_ANALYSIS_WAIT_MAX_MS = 300_000;

/** What the "Análise da IA" card shows for one view (guided-creation spec section 4). */
export type ReferenceAnalysisDisplay =
  | { kind: 'unavailable'; reason: ReferenceAnalysisUnavailable }
  | { kind: 'not-yet' }
  | { kind: 'waiting' }
  | { kind: 'done'; analysis: ReferenceStyleAnalysis; mock: boolean; frames: number | null }
  | { kind: 'failed'; code: AssetJobErrorCode | null };

export function referenceAnalysisDisplayOf(view: ReferenceAnalysisView): ReferenceAnalysisDisplay {
  // A version that cannot be analysed says why first, whatever an older job left behind.
  if (view.unavailable !== null) return { kind: 'unavailable', reason: view.unavailable };
  switch (view.status) {
    case 'none':
      return { kind: 'not-yet' };
    case 'requested':
    case 'running':
      return { kind: 'waiting' };
    case 'done':
      return view.analysis === null
        ? { kind: 'failed', code: 'output-invalid' }
        : { kind: 'done', analysis: view.analysis, mock: view.mode === 'mock', frames: view.frames };
    case 'failed':
    case 'refused':
      return { kind: 'failed', code: view.errorCode };
  }
}

export function analysisIsWaiting(view: ReferenceAnalysisView | null): boolean {
  return view !== null && referenceAnalysisDisplayOf(view).kind === 'waiting';
}

/** The owner can ask for a (new) analysis: never for an unavailable version or while one runs. */
export function analysisCanBeRequested(display: ReferenceAnalysisDisplay): boolean {
  return display.kind === 'not-yet' || display.kind === 'failed' || display.kind === 'done';
}
