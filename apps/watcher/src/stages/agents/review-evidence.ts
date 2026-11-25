import type { StageExecutionContext } from '@studio/shared/ports';
import { clip } from '../../engine/text';
import { type ReviewOutcome } from '../shared/stage-artifacts';
import { type CheckEvidence } from '../shared/stage-results';
import { stageTexts } from '../shared/stage-texts';

/** At most 20 reported issues of at most 300 characters each. */
const MAX_ISSUES = 20;
const ISSUE_MAX_CHARS = 300;

/** The recipe's `reviewer-score` threshold; 1 (any score) when the recipe defines none. */
function minOverallOf(context: StageExecutionContext): number {
  const definition = context.recipe.checks.find((check) => check.id === 'reviewer-score');
  return definition?.id === 'reviewer-score' ? definition.minOverall : 1;
}

/**
 * `reviewer-score` as evidence (topology section 5: the pass decision is the engine's and the
 * owner's). A score at or above the recipe threshold passes; a lower score or a missing review is
 * `skipped` with the reason, which the engine records as a caveat; a low score never stops the run.
 */
export function reviewerScoreEvidence(context: StageExecutionContext, outcome: ReviewOutcome | null): CheckEvidence {
  const minOverall = minOverallOf(context);
  const expected = `nota geral do revisor >= ${minOverall}`;
  if (outcome === null || outcome.status === 'unavailable') {
    return { outcome: 'skipped', expected, measured: 'revisão indisponível', detail: stageTexts.reviewerUnavailableWarning };
  }
  const { overall, blockingIssues } = outcome.verdict;
  if (overall >= minOverall) return { outcome: 'passed', expected, measured: `nota geral ${overall}`, detail: '' };
  return {
    outcome: 'skipped',
    expected,
    measured: `nota geral ${overall}`,
    detail: `Nota abaixo do limite da receita; revise com atenção. ${blockingIssues.join('; ')}`,
  };
}

/**
 * Owner decision 2026-11-24: a review never stops the run. A spent revision budget or a score under
 * the recipe threshold lets the last draft go on, and this caveat tells the owner what the Reviewer
 * still saw; the `reviewer-score` check records the same low score as `skipped`. Null when the
 * review raises nothing to report.
 */
export function reviewCaveat(context: StageExecutionContext, outcome: ReviewOutcome, exhausted: boolean): string | null {
  if (outcome.status !== 'recorded') return null;
  const { verdict } = outcome;
  const lowScore = verdict.overall < minOverallOf(context);
  if (!exhausted && !lowScore) return null;
  const issues = (verdict.blockingIssues.length > 0 ? verdict.blockingIssues : [verdict.retryInstruction])
    .filter((issue) => issue.trim() !== '')
    .slice(0, MAX_ISSUES)
    .map((issue) => clip(issue, ISSUE_MAX_CHARS));
  return stageTexts.reviewerContinued(verdict.overall, issues);
}
