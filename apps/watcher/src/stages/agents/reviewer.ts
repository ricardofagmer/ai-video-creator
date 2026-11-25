import { buildReviewPacket } from '@studio/core/agents';
import { EVALUATOR_ROLE, type ScenesOutput, type ScriptOutput } from '@studio/shared/agents';
import type { StageExecutionContext } from '@studio/shared/ports';
import { type ModelUse, type QaMetrics, type ReviewSubject } from '@studio/shared/run-format';
import { type StageDependencies } from '../shared/stage-dependencies';
import { callAgent } from './agent-call';
import { type ReviewAttempt } from './evaluator-loop';
import { buildPacket, coordinatesOf, reviewArtifacts } from './packet-sources';

/**
 * One Reviewer call (role `evaluator`). Any failure, an invalid packet included, degrades to
 * `unavailable` (core `agentFailurePolicy`: Reviewer -> warning, topology section 9); the pass
 * decision stays with the engine's checks and the owner gate, never with the Reviewer.
 */
export async function reviewSubject(
  dependencies: Pick<StageDependencies, 'agents'>,
  request: { context: StageExecutionContext; subject: ReviewSubject; models: ModelUse[]; qaMetrics?: QaMetrics; draft?: ScriptOutput | ScenesOutput },
): Promise<ReviewAttempt> {
  const { context, subject, models, qaMetrics, draft } = request;
  const built = buildPacket(context, EVALUATOR_ROLE, () =>
    buildReviewPacket({
      coordinates: coordinatesOf(context),
      subject,
      rubric: context.recipe.rubric,
      brief: context.brief,
      artifactIds: reviewArtifacts[subject],
      ...(qaMetrics === undefined ? {} : { qaMetrics }),
      ...(draft === undefined ? {} : { draft }),
    }),
  );
  if (built.status === 'invalid') return { status: 'unavailable' };
  const call = await callAgent(dependencies.agents, { context, role: EVALUATOR_ROLE, packet: built.packet, models });
  return call.status === 'ok' ? { status: 'ok', verdict: call.output } : { status: 'unavailable' };
}
