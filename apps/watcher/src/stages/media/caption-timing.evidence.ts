import { readFile } from 'node:fs/promises';
import type { StageExecutionContext } from '@studio/shared/ports';
import { resolveInsideRunReal } from '@studio/shared/run-files';
import { NarrationIndexSchema } from '../shared/stage-artifacts';
import { findStageInput, readOptionalStageInput } from '../shared/stage-io';
import { type CheckEvidence } from '../shared/stage-results';
import { captionDrift, type CaptionDrift } from './captions-srt';

/** Used when a stage lists `caption-timing` but the recipe defines no threshold: about 5 frames at 30 fps. */
const DEFAULT_MAX_DRIFT_MS = 150;

export function maxCaptionDriftMs(context: StageExecutionContext): number {
  const definition = context.recipe.checks.find((check) => check.id === 'caption-timing');
  return definition?.id === 'caption-timing' ? definition.maxDriftMs : DEFAULT_MAX_DRIFT_MS;
}

/** Drift of the recorded SRT against the recorded narration; null when either is not in the run. */
export async function recordedCaptionDrift(context: StageExecutionContext, srtPath: string | null): Promise<CaptionDrift | null> {
  const narration = await readOptionalStageInput(context, 'narration-index', NarrationIndexSchema);
  if (narration === null || srtPath === null) return null;
  const srt = await readFile(await resolveInsideRunReal(context.runDir, srtPath), 'utf8');
  return captionDrift(srt, narration.words, context.recipe.format.captions.maxLines);
}

/** Run-relative path of the `captions` SRT when an earlier stage recorded it. */
export function recordedSrtPath(context: StageExecutionContext): string | null {
  return findStageInput(context, 'captions')?.path ?? null;
}

export function captionTimingEvidence(context: StageExecutionContext, drift: CaptionDrift | null): CheckEvidence {
  const maxDriftMs = maxCaptionDriftMs(context);
  const expected = `deriva das legendas <= ${maxDriftMs} ms`;
  if (drift === null) return { outcome: 'skipped', expected, measured: 'sem legendas ou narração registradas', detail: '' };
  if (drift.status === 'no-cues') return { outcome: 'failed', expected, measured: 'arquivo de legendas sem nenhuma legenda', detail: '' };
  if (drift.status === 'cue-count-mismatch') {
    return { outcome: 'failed', expected, measured: `${drift.written} legenda(s) escritas, ${drift.expected} esperadas`, detail: '' };
  }
  return {
    outcome: drift.driftMs <= maxDriftMs ? 'passed' : 'failed',
    expected,
    measured: `${drift.driftMs} ms`,
    detail: 'Tempos de palavra estimados a partir da duração de cada fala.',
  };
}
