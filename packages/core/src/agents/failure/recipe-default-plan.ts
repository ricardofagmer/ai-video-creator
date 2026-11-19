import { PlanOutputSchema, type PlanOutput, type PlannerPacket } from '@studio/shared/agents';
import { PhaseIdSchema, stagePhase, type StageEstimate, type StageId } from '@studio/shared/run-format';

export class MissingStageEstimateError extends Error {
  readonly category = 'internal';

  constructor(readonly stageId: StageId) {
    super(`No engine estimate for stage ${stageId}; the default plan cannot be built`);
    this.name = 'MissingStageEstimateError';
  }
}

/**
 * Topology section 9 Planner fallback: the deterministic default plan from the recipe, built from
 * the same packet the Planner received, with the engine's own estimates. Every recipe stage is
 * kept in order with its enabled flag and checks; nothing is invented. The engine records it with
 * `plan.source = 'recipe-default'` and the `plannerFallbackText` warning; it is never presented as
 * the Planner's answer.
 */
export function recipeDefaultPlan(packet: PlannerPacket, estimates: ReadonlyMap<StageId, StageEstimate>): PlanOutput {
  const estimateOf = (stageId: StageId): StageEstimate => {
    const estimate = estimates.get(stageId);
    if (estimate === undefined) throw new MissingStageEstimateError(stageId);
    return estimate;
  };
  const phases = PhaseIdSchema.options
    .map((phaseId) => ({
      id: phaseId,
      stages: packet.inputs.recipe.stages
        .filter((stage) => stagePhase[stage.stageId] === phaseId)
        .map((stage) => ({ stageId: stage.stageId, enabled: stage.enabled, checks: [...stage.checks], estimate: estimateOf(stage.stageId) })),
    }))
    .filter((phase) => phase.stages.length > 0);
  const totalEstimateUsd = phases
    .flatMap((phase) => phase.stages)
    .filter((stage) => stage.enabled)
    .reduce((total, stage) => total + stage.estimate.usd, 0);
  return PlanOutputSchema.parse({ phases, totalEstimateUsd, risks: [], questionsForOwner: [] });
}
