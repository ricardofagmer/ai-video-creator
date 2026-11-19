import type { StageExecutionContext } from '@studio/shared/ports';
import { type StageInput } from '@studio/shared/run-format';

/**
 * Video outputs in reverse A5 order. A stage's brief lists only earlier outputs, so the first one
 * present is the most finished video so far, whichever optional stages the recipe switched off.
 */
const VIDEO_OUTPUTS = ['music', 'fades', 'captions-video', 'composition'];

export function latestVideoInput(context: StageExecutionContext): StageInput | undefined {
  for (const name of VIDEO_OUTPUTS) {
    const input = context.stageBrief.inputs.find((candidate) => candidate.name === name);
    if (input !== undefined) return input;
  }
  return undefined;
}
