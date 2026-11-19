import { buildPlannerPacket, plannerFallbackText, recipeDefaultPlan, type PlannerPacketSource } from '@studio/core/agents';
import { PRICE_TABLE, toPriceTableSummary } from '@studio/core/costs';
import { PLANNER_ROLE, PlanOutputSchema, type PlanOutput } from '@studio/shared/agents';
import type { StageExecutionContext, StageExecutionResult, StagePlanningContext } from '@studio/shared/ports';
import { type DeclaredOutput, type ModelUse, type StageEstimate, type StageId } from '@studio/shared/run-format';
import { clip } from '../../engine/text';
import { callAgent } from '../agents/agent-call';
import { buildPacket, coordinatesOf } from '../agents/packet-sources';
import { BaseStageExecutor } from '../shared/base-stage.executor';
import { PlanSourceSchema } from '../shared/stage-artifacts';
import { type StageDependencies } from '../shared/stage-dependencies';
import { agentCallsEstimate } from '../shared/stage-estimates';
import { stageOutput, type StageOutputSink } from '../shared/stage-io';
import { reportedSuccess, stageFailed, type CheckEvidenceMap } from '../shared/stage-results';

const JSON_MIME = 'application/json';
const RISK_MAX_CHARS = 300;
const MAX_RISKS = 10;

/** Every enabled stage's estimate, keyed by stage id, for the recipe-default plan. */
export type StageEstimator = (context: StagePlanningContext) => Promise<ReadonlyMap<StageId, StageEstimate>>;

/**
 * `plan` (PRD 7.1 "brief" stage): the Planner proposes the plan the owner approves at the plan
 * gate. When the Planner fails (any failure but a refused credential, which must reach the owner
 * as `authentication`), the deterministic recipe default plan stands in (core `recipeDefaultPlan`,
 * topology section 9) and the fallback is written to the `plan-source` sidecar and as the first
 * plan risk, so plan.md shows it: the engine's PlanRecorder records every plan as `planner`.
 */
export class PlanExecutor extends BaseStageExecutor {
  readonly stageId = 'plan';
  protected readonly faultProvider = 'claude';
  protected override readonly appliesCallFaults = false;

  constructor(
    dependencies: StageDependencies,
    private readonly estimateStages: StageEstimator,
  ) {
    super(dependencies);
  }

  async estimate(): Promise<StageEstimate> {
    return agentCallsEstimate([PLANNER_ROLE], this.isLive('claude'));
  }

  declaredOutputs(context: StagePlanningContext): readonly DeclaredOutput[] {
    return [stageOutput(context.stage, 'plan', 'plan.json', JSON_MIME), stageOutput(context.stage, 'plan-source', 'plan-source.json', JSON_MIME)];
  }

  protected async checkEvidence(): Promise<CheckEvidenceMap> {
    return new Map();
  }

  protected async run(context: StageExecutionContext, outputs: StageOutputSink): Promise<StageExecutionResult> {
    const source = await this.plannerSourceOf(context);
    const built = buildPacket(context, PLANNER_ROLE, () => buildPlannerPacket(source));
    if (built.status === 'invalid') return stageFailed(built.failure);
    const models: ModelUse[] = [];
    const call = await callAgent(this.dependencies.agents, { context, role: PLANNER_ROLE, packet: built.packet, models });
    if (call.status === 'failed' && call.failure.class === 'authentication') return stageFailed(call.failure, models);

    if (call.status === 'ok') {
      await outputs.writeJson('plan', PlanOutputSchema, call.output);
      await outputs.writeJson('plan-source', PlanSourceSchema, { format: 1, source: 'planner', warning: null });
      return reportedSuccess('Plano proposto pelo planejador.', models);
    }
    const warning = clip(plannerFallbackText(call.cause), RISK_MAX_CHARS);
    const fallback = recipeDefaultPlan(built.packet, await this.estimateStages(context));
    await outputs.writeJson('plan', PlanOutputSchema, withLeadingRisk(fallback, warning));
    await outputs.writeJson('plan-source', PlanSourceSchema, { format: 1, source: 'recipe-default', warning });
    return reportedSuccess(warning, models);
  }

  private async plannerSourceOf(context: StageExecutionContext): Promise<PlannerPacketSource> {
    const { catalog, ledger, clock } = this.dependencies;
    return {
      coordinates: coordinatesOf(context),
      brief: context.brief,
      recipe: context.recipe,
      boundAssets: await catalog.boundSummaries(context),
      priceTable: toPriceTableSummary(PRICE_TABLE),
      costPerRunUsd: context.limits.costPerRunUsd,
      costPerMonthUsd: context.limits.costPerMonthUsd,
      monthToDateUsd: await ledger.monthToDateUsd(clock.now()),
    };
  }
}

function withLeadingRisk(plan: PlanOutput, risk: string): PlanOutput {
  return { ...plan, risks: [risk, ...plan.risks].slice(0, MAX_RISKS) };
}
