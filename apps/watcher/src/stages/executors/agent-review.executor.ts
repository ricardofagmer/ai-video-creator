import { REVIEW_UNAVAILABLE_TEXT } from '@studio/core/agents';
import type { StageExecutionContext, StageExecutionResult, StagePlanningContext } from '@studio/shared/ports';
import { QaMetricsSchema, type CheckId, type DeclaredOutput, type ModelUse, type StageEstimate } from '@studio/shared/run-format';
import { reviewerScoreEvidence } from '../agents/review-evidence';
import { emitReviewVerdict } from '../agents/review-verdict.events';
import { reviewSubject } from '../agents/reviewer';
import { BaseStageExecutor } from '../shared/base-stage.executor';
import { ReviewOutcomeSchema } from '../shared/stage-artifacts';
import { agentCallsEstimate } from '../shared/stage-estimates';
import { readOptionalStageInput, readOwnOutput, stageOutput, type StageOutputSink } from '../shared/stage-io';
import { reportedSuccess, type CheckEvidence, type CheckEvidenceMap } from '../shared/stage-results';
import { stageTexts } from '../shared/stage-texts';

/**
 * `agent-review`: one Reviewer pass over the render, with the QA metrics as evidence (topology
 * section 5). Evidence only: no retry loop here, the pass decision stays with the engine checks
 * and the owner gate, and a Reviewer failure degrades to a warning (section 9).
 */
export class AgentReviewExecutor extends BaseStageExecutor {
  readonly stageId = 'agent-review';
  protected readonly faultProvider = 'claude';
  protected override readonly appliesCallFaults = false;

  async estimate(): Promise<StageEstimate> {
    return agentCallsEstimate(['evaluator'], this.agentCallsBilled());
  }

  declaredOutputs(context: StagePlanningContext): readonly DeclaredOutput[] {
    return [stageOutput(context.stage, 'review-render-outcome', 'review-outcome.json', 'application/json')];
  }

  protected async checkEvidence(context: StageExecutionContext, checks: readonly CheckId[]): Promise<CheckEvidenceMap> {
    const evidence = new Map<CheckId, CheckEvidence>();
    if (checks.includes('reviewer-score')) {
      evidence.set('reviewer-score', reviewerScoreEvidence(context, await readOwnOutput(context, 'review-render-outcome', ReviewOutcomeSchema)));
    }
    return evidence;
  }

  protected async run(context: StageExecutionContext, outputs: StageOutputSink): Promise<StageExecutionResult> {
    const models: ModelUse[] = [];
    const qaMetrics = await readOptionalStageInput(context, 'qa-metrics', QaMetricsSchema);
    const review = await reviewSubject(this.dependencies, { context, subject: 'render', models, ...(qaMetrics === null ? {} : { qaMetrics }) });
    if (review.status === 'unavailable') {
      await outputs.writeJson('review-render-outcome', ReviewOutcomeSchema, { format: 1, status: 'unavailable', revisions: 0, reason: REVIEW_UNAVAILABLE_TEXT });
      return reportedSuccess(stageTexts.reviewerUnavailableWarning, models);
    }
    await emitReviewVerdict(context, 'render', review.verdict);
    await outputs.writeJson('review-render-outcome', ReviewOutcomeSchema, { format: 1, status: 'recorded', revisions: 0, verdict: review.verdict });
    return reportedSuccess(`Revisão do vídeo: nota geral ${review.verdict.overall}.`, models);
  }
}
