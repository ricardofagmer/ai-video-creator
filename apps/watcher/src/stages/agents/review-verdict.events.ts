import { type ReviewVerdict } from '@studio/shared/agents';
import type { StageExecutionContext } from '@studio/shared/ports';
import { type ReviewSubject } from '@studio/shared/run-format';
import { clip } from '../../engine/text';

/** C3 `review.verdict` limits: criterion ids of at most 64 characters, at most 20 scores. */
const CRITERION_ID_MAX = 64;
const MAX_SCORES = 20;

/**
 * Topology section 10: every review emits its scores, criterion ids and retry flag. Criterion ids
 * come from model output, so each is clipped to the C3 limit (obligation 1) before the engine
 * validates the event; an over-long id must not turn a usable review into an engine fault.
 */
export async function emitReviewVerdict(context: StageExecutionContext, subject: ReviewSubject, verdict: ReviewVerdict): Promise<void> {
  await context.events.emit({
    type: 'review.verdict',
    level: 'agent',
    text: `Revisão (${subject}): nota geral ${verdict.overall}.`,
    subject,
    scores: verdict.scores.slice(0, MAX_SCORES).map(({ criterionId, score }) => ({ criterionId: clipCriterionId(criterionId), score })),
    overall: verdict.overall,
    retryRecommended: verdict.retryRecommended,
  });
}

function clipCriterionId(criterionId: string): string {
  return criterionId.length <= CRITERION_ID_MAX ? criterionId : clip(criterionId, CRITERION_ID_MAX);
}
