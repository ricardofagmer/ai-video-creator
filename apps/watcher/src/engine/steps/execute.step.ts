import { Inject, Injectable } from '@nestjs/common';
import type { StageExecutionResult } from '@studio/shared/ports';
import { RunFileSchemaError } from '@studio/shared/run-files';
import { type ModelUse, type StepName } from '@studio/shared/run-format';
import { NextBriefDrafter } from '../brief/next-brief.drafter';
import { ownerTexts } from '../owner-texts';
import { findMissingDeclaredOutputs } from '../postconditions/declared-outputs';
import { type StageWorkspace } from '../stage-workspace';
import { buildExecutionContext } from './execution-context';
import { postconditionFailed, type StepContext, type StepHandler, type StepOutcome } from './step-handler';

/**
 * Step 4: run the stage executor. Its `reported-success` is a claim: the step is `ok` only when
 * every required output declared in the stage brief exists and is non-empty, and every optional
 * one that exists is non-empty too (PRD 7.2, criterion 11, SPEC 0002 rev 4 A30). The
 * models the attempt reported, failed or not, go into the stage input manifest (SPEC 0002 rev 3).
 * The next stage's brief is drafted while the executor runs (PRD 7.2 step 4, K1).
 */
@Injectable()
export class ExecuteStep implements StepHandler {
  readonly step: StepName = 'execute';

  constructor(@Inject(NextBriefDrafter) private readonly nextBrief: NextBriefDrafter) {}

  async run(context: StepContext): Promise<StepOutcome> {
    const { workspace } = context;
    const executionContext = await buildExecutionContext(context);
    const draft = this.nextBrief.draftAfter(workspace.active, workspace.location);
    let result: StageExecutionResult;
    try {
      result = await workspace.executor.execute(executionContext);
    } finally {
      // The draft never rejects; awaiting it here keeps its write inside this step.
      await this.nextBrief.report(workspace.active, await draft);
    }
    await workspace.active.flushNow();
    const models = await recordModels(workspace, result.models);
    if (result.status === 'failed') {
      return { kind: 'failed', failure: { origin: 'executor', failure: result.failure }, detail: result.failure.message };
    }

    if (models.kind === 'invalid') return postconditionFailed(this.step, models.detail);
    const missing = await findMissingDeclaredOutputs(workspace.runDir, executionContext.stageBrief.declaredOutputs);
    if (missing.length > 0) {
      return postconditionFailed(this.step, ownerTexts.outputsMissing(missing.map((output) => `${output.name} (${output.problem})`)));
    }
    return { kind: 'passed', detail: ownerTexts.executorReported(result.summary) };
  }
}

type ModelsRecording = { kind: 'recorded' } | { kind: 'invalid'; detail: string };

/** An executor failure keeps precedence over an invalid model list, so its failure class still decides. */
async function recordModels(workspace: StageWorkspace, models: readonly ModelUse[]): Promise<ModelsRecording> {
  try {
    await workspace.recordModelsUsed(models);
    return { kind: 'recorded' };
  } catch (error) {
    if (error instanceof RunFileSchemaError) return { kind: 'invalid', detail: error.problems.slice(0, 3).join('; ') };
    throw error;
  }
}
