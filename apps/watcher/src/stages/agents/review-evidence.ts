import { revisionsExhaustedText } from '@studio/core/agents';
import { type ReviewVerdict } from '@studio/shared/agents';
import type { StageExecutionContext, StageFailure } from '@studio/shared/ports';
import { type StageId } from '@studio/shared/run-format';
import { clip } from '../../engine/text';
import { type ReviewOutcome } from '../shared/stage-artifacts';
import { needsPerson, type CheckEvidence } from '../shared/stage-results';
import { stageTexts } from '../shared/stage-texts';

/** C3 `revisions-exhausted.issues`: at most 20 issues of at most 300 characters. */
const MAX_ISSUES = 20;
const ISSUE_MAX_CHARS = 300;

/** The recipe's `reviewer-score` threshold; 1 (any score) when the recipe defines none. */
function minOverallOf(context: StageExecutionContext): number {
  const definition = context.recipe.checks.find((check) => check.id === 'reviewer-score');
  return definition?.id === 'reviewer-score' ? definition.minOverall : 1;
}

/**
 * `reviewer-score` as evidence only (topology section 5: the pass decision is the engine's and the
 * owner's). A score at or above the recipe threshold passes; a lower score or a missing review is
 * `skipped` with the reason, which the engine records as a caveat for the owner gate.
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

/** Spent revision budget with the Reviewer still asking: the owner decides (topology section 7). */
export function revisionsExhaustedFailure(stageId: StageId, verdict: ReviewVerdict): StageFailure {
  const issues = (verdict.blockingIssues.length > 0 ? verdict.blockingIssues : [verdict.retryInstruction])
    .slice(0, MAX_ISSUES)
    .map((issue) => clip(issue, ISSUE_MAX_CHARS));
  return needsPerson({ kind: 'revisions-exhausted', stageId, issues }, revisionsExhaustedText(issues), stageTexts.revisionsExhaustedWhatToDo);
}
