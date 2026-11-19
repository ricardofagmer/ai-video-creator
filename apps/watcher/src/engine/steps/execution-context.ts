import type { StageExecutionContext } from '@studio/shared/ports';
import { stageEventSink } from '../stage-event-sink';
import { type StepContext } from './step-handler';

/** What `execute` and `verify` hand to the stage executor (C6 `StageExecutionContext`). */
export async function buildExecutionContext(context: StepContext): Promise<StageExecutionContext> {
  const { workspace } = context;
  return {
    ...workspace.planningContext(),
    runDir: workspace.runDir,
    attempt: context.attempt,
    stepKey: context.stepKey,
    stageBrief: await workspace.stageBrief(),
    inputManifest: await workspace.stageInputManifest(),
    assets: await workspace.resolvedAssets(context.signal),
    correlationId: workspace.active.snapshot.correlationId,
    signal: context.signal,
    report: (activity) => workspace.active.report(activity),
    events: stageEventSink(workspace.active, context.stepKey),
  };
}
