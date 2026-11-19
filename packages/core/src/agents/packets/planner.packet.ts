import {
  OutputContractSchema,
  PLANNER_ROLE,
  PLAN_RUN_TASK,
  PlannerPacketSchema,
  type PlannerPacket,
  type PriceTableSummary,
  type RecipeSummary,
} from '@studio/shared/agents';
import { recipeRefOf, type Brief, type Recipe } from '@studio/shared/recipes';
import { stagePhase, type PhaseId } from '@studio/shared/run-format';
import { bindingSummaries, packetBaseFor, type BoundAssetSummary, type PacketCoordinates } from './packet-support';

export interface PlannerPacketSource {
  readonly coordinates: PacketCoordinates;
  readonly brief: Brief;
  /** The run's pinned recipe version (run.json `recipe.definition`). */
  readonly recipe: Recipe;
  readonly boundAssets: readonly BoundAssetSummary[];
  /** R1-11 `toPriceTableSummary(PRICE_TABLE)`. */
  readonly priceTable: PriceTableSummary;
  readonly costPerRunUsd: number;
  readonly costPerMonthUsd: number;
  /** An aggregate of the ledger; no other run's files or state reach the packet. */
  readonly monthToDateUsd: number;
}

/** `ref, phases, stages (on/off), checks, inputs schema, rubric ref`; the criteria stay out. */
function recipeSummary(recipe: Recipe): RecipeSummary {
  const phases = [...new Set(recipe.graph.stages.map((stage): PhaseId => stagePhase[stage.stageId]))];
  return {
    ref: recipeRefOf(recipe),
    phases,
    stages: recipe.graph.stages.map((stage) => ({ stageId: stage.stageId, enabled: stage.enabled, checks: [...stage.checks] })),
    inputs: recipe.inputs,
    rubricRef: recipeRefOf(recipe),
  };
}

/**
 * Planner packet (topology section 5). Never sees (section 2): asset bytes (only binding
 * summaries are copied), biometric assets (`bindingSummaries` drops them), credentials (no
 * source field carries one), other runs' state (only the month-to-date aggregate).
 */
export function buildPlannerPacket(source: PlannerPacketSource): PlannerPacket {
  return PlannerPacketSchema.parse({
    ...packetBaseFor(PLANNER_ROLE, source.coordinates),
    task: PLAN_RUN_TASK,
    inputs: {
      brief: source.brief,
      recipe: recipeSummary(source.recipe),
      bindings: bindingSummaries(source.boundAssets),
      priceTable: source.priceTable,
      limits: {
        costPerRunUsd: source.costPerRunUsd,
        costPerMonthUsd: source.costPerMonthUsd,
        monthToDateUsd: source.monthToDateUsd,
      },
    },
    constraints: { stageSetFixed: true, maxDurationSec: Math.max(1, Math.floor(source.recipe.format.duration.maxSec)) },
    outputContract: OutputContractSchema.enum.PlanOutput,
  });
}
