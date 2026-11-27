import { REVIEW_UNAVAILABLE_TEXT, type Revision } from '@studio/core/agents';
import { type ReviewVerdict } from '@studio/shared/agents';
import type { StageExecutionContext, StageFailure } from '@studio/shared/ports';
import { type ReviewSubject } from '@studio/shared/run-format';
import { type ReviewOutcome } from '../shared/stage-artifacts';
import { emitReviewVerdict } from './review-verdict.events';

export type GeneratorAttempt<Output> = { status: 'ok'; output: Output } | { status: 'failed'; failure: StageFailure; cause: string };
export type ReviewAttempt = { status: 'ok'; verdict: ReviewVerdict } | { status: 'unavailable' };

export interface EvaluatorLoopRequest<Output> {
  context: StageExecutionContext;
  subject: ReviewSubject;
  generate(revision: Revision<Output> | undefined): Promise<GeneratorAttempt<Output>>;
  review(output: Output): Promise<ReviewAttempt>;
}

export type EvaluatorLoopResult<Output> =
  | { status: 'accepted'; output: Output; review: ReviewOutcome }
  | { status: 'generator-failed'; failure: StageFailure; cause: string }
  | { status: 'revisions-exhausted'; output: Output; verdict: ReviewVerdict; revisions: number };

/** Topology section 7: a retry needs both the flag and a non-blank instruction. */
function wantsRevision(verdict: ReviewVerdict): boolean {
  return verdict.retryRecommended && verdict.retryInstruction.trim().length > 0;
}

/**
 * Evaluator loop of the generator stages (topology section 7). Generate, review, and revise only
 * when the Reviewer asks with an instruction, at most `limits.revisionsPerStage` times (2 by
 * default: 3 generator attempts). A spent budget with the Reviewer still asking returns
 * `revisions-exhausted`; the executor keeps that last output and continues with a caveat. A Reviewer failure degrades to a warning (section 9): the
 * last output stands and the owner review gate still follows.
 */
export async function runEvaluatorLoop<Output>(request: EvaluatorLoopRequest<Output>): Promise<EvaluatorLoopResult<Output>> {
  const maxRevisions = request.context.limits.revisionsPerStage;
  let revision: Revision<Output> | undefined;
  let revisions = 0;
  for (;;) {
    request.context.signal.throwIfAborted();
    const generated = await request.generate(revision);
    if (generated.status === 'failed') return { status: 'generator-failed', failure: generated.failure, cause: generated.cause };
    const reviewed = await request.review(generated.output);
    if (reviewed.status === 'unavailable') {
      return { status: 'accepted', output: generated.output, review: { format: 1, status: 'unavailable', revisions, reason: REVIEW_UNAVAILABLE_TEXT } };
    }
    await emitReviewVerdict(request.context, request.subject, reviewed.verdict);
    if (!wantsRevision(reviewed.verdict)) {
      return { status: 'accepted', output: generated.output, review: { format: 1, status: 'recorded', revisions, verdict: reviewed.verdict } };
    }
    if (revisions >= maxRevisions) return { status: 'revisions-exhausted', output: generated.output, verdict: reviewed.verdict, revisions };
    revisions += 1;
    revision = { instruction: reviewed.verdict.retryInstruction, previousOutput: generated.output };
  }
}
