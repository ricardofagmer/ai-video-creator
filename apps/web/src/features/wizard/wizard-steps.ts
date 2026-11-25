import { type CompositionConflict } from '@studio/shared/recipes';
import { type RunState } from '@studio/shared/run-format';
import { hasReview } from '@/features/runs/run-labels';

/** The steps of "Criar vídeo" in order (guided-creation spec section 5); the index is the step number. */
export const wizardSteps = ['idea', 'references', 'recipe', 'style', 'review', 'production', 'result'] as const;
export type WizardStep = (typeof wizardSteps)[number];

/** Steps answered in the browser before the run exists; the draft remembers only these. */
export const draftSteps = ['idea', 'references', 'recipe', 'style', 'review'] as const satisfies readonly WizardStep[];
export type DraftStep = (typeof draftSteps)[number];

export function stepNumber(step: WizardStep): number {
  return wizardSteps.indexOf(step);
}

export function isDraftStep(value: string): value is DraftStep {
  return draftSteps.some((step) => step === value);
}

/** The draft step after `step`; the review step has no next draft step (it starts the run). */
export function nextDraftStep(step: DraftStep): DraftStep {
  const index = draftSteps.indexOf(step);
  return draftSteps[Math.min(index + 1, draftSteps.length - 1)] ?? step;
}

export function previousDraftStep(step: DraftStep): DraftStep {
  const index = draftSteps.indexOf(step);
  return draftSteps[Math.max(index - 1, 0)] ?? step;
}

/**
 * Which step a run id in the URL resumes at: the result once the run has a review (the final
 * video exists), production for everything before that, failures included.
 */
export function runStepOf(state: RunState): Extract<WizardStep, 'production' | 'result'> {
  return hasReview(state) ? 'result' : 'production';
}

/**
 * Where the owner fixes a conflict: the duration is typed in the idea, every pin and the music
 * choice ("Choose the song" or "AI decides") are made in voice and style.
 */
export function stepOfConflict(conflict: CompositionConflict): DraftStep {
  switch (conflict.rule) {
    case 'duration-outside-template':
      return conflict.subject === 'run-target' ? 'idea' : 'recipe';
    case 'duplicate-kind':
    case 'stage-needs-binding':
    case 'template-format-mismatch':
    case 'music-mode-conflict':
      return 'style';
  }
}

/** The steps that fix the listed conflicts, once each, in step order. */
export function stepsToFix(conflicts: readonly CompositionConflict[]): DraftStep[] {
  const steps = new Set(conflicts.map(stepOfConflict));
  return draftSteps.filter((step) => steps.has(step));
}
