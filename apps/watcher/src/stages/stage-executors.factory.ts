import type { StageExecutorPort, StagePlanningContext } from '@studio/shared/ports';
import { type StageEstimate, type StageId } from '@studio/shared/run-format';
import { AgentReviewExecutor } from './executors/agent-review.executor';
import { CaptionsExecutor } from './executors/captions.executor';
import { CaptureExecutor } from './executors/capture.executor';
import { CompositionExecutor } from './executors/composition.executor';
import { FadesExecutor } from './executors/fades.executor';
import { MusicExecutor } from './executors/music.executor';
import { NarrationExecutor } from './executors/narration.executor';
import { PackageExecutor } from './executors/package.executor';
import { PlanExecutor, type StageEstimator } from './executors/plan.executor';
import { QaExecutor } from './executors/qa.executor';
import { ResearchExecutor } from './executors/research.executor';
import { ScenesExecutor } from './executors/scenes.executor';
import { ScriptExecutor } from './executors/script.executor';
import { VerifyExecutor } from './executors/verify.executor';
import { type StageDependencies } from './shared/stage-dependencies';

/**
 * The fourteen R1-14 executors in A5 order. The planner's deterministic fallback needs every
 * enabled stage's estimate, so `plan` receives an estimator over the same instances; estimates have
 * no side effects and never throw (C6).
 */
export function createStageExecutors(dependencies: StageDependencies): readonly StageExecutorPort[] {
  const byStage = new Map<StageId, StageExecutorPort>();
  const estimateStages: StageEstimator = async (context) => estimateEnabledStages(context, byStage);
  const executors: StageExecutorPort[] = [
    new PlanExecutor(dependencies, estimateStages),
    new ResearchExecutor(dependencies),
    new VerifyExecutor(dependencies),
    new ScriptExecutor(dependencies),
    new CaptureExecutor(dependencies),
    new ScenesExecutor(dependencies),
    new NarrationExecutor(dependencies),
    new CompositionExecutor(dependencies),
    new CaptionsExecutor(dependencies),
    new FadesExecutor(dependencies),
    new MusicExecutor(dependencies),
    new QaExecutor(dependencies),
    new AgentReviewExecutor(dependencies),
    new PackageExecutor(dependencies),
  ];
  for (const executor of executors) byStage.set(executor.stageId, executor);
  return executors;
}

/** Enabled recipe stages are numbered 1..N in graph order, as the engine numbers the run's stages. */
async function estimateEnabledStages(
  context: StagePlanningContext,
  executors: ReadonlyMap<StageId, StageExecutorPort>,
): Promise<ReadonlyMap<StageId, StageEstimate>> {
  const estimates = new Map<StageId, StageEstimate>();
  const enabled = context.recipe.graph.stages.filter((stage) => stage.enabled);
  for (const [index, recipeStage] of enabled.entries()) {
    const executor = executors.get(recipeStage.stageId);
    if (executor === undefined) continue;
    const planning: StagePlanningContext = { ...context, stage: { stageNumber: index + 1, stageId: recipeStage.stageId }, params: recipeStage.params };
    estimates.set(recipeStage.stageId, await executor.estimate(planning));
  }
  return estimates;
}
