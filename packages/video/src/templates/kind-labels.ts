import type { SceneKind } from '@studio/shared/ace';

export const kindLabels: Record<SceneKind, string> = {
  hook: 'Watch this',
  problem: 'The problem',
  rubric: 'The rubric',
  overview: 'The blueprint',
  step: 'Step',
  evidence: 'Round',
  result: 'The result',
  analysis: 'Analysis',
  verdict: 'Verdict',
  cta: 'Try it',
};

/** "Step 2 / 3" style label; single scenes of a kind get the plain label. */
export function numberedLabel(kind: SceneKind, kindNumber: number, kindCount: number): string {
  return kindCount > 1 ? `${kindLabels[kind]} ${kindNumber} / ${kindCount}` : kindLabels[kind];
}
