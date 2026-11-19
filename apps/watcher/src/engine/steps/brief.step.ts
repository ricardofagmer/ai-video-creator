import { Inject, Injectable } from '@nestjs/common';
import { RunFileSchemaError, readStageBrief, writeStageBrief } from '@studio/shared/run-files';
import { type StageBrief, type StepName } from '@studio/shared/run-format';
import { StageBriefComposer } from '../brief/stage-brief.composer';
import { STAGE_BRIEF_TEMPLATE_ID } from '../brief/stage-brief.templates';
import { type Clock } from '../clock';
import { LearningNotesUnavailableError } from '../engine.errors';
import { CLOCK } from '../engine.tokens';
import { ownerTexts } from '../owner-texts';
import { type StageWorkspace } from '../stage-workspace';
import { postconditionFailed, type StepContext, type StepHandler, type StepOutcome } from './step-handler';

/**
 * Step 1: render `stages/<NN>-<stageId>/brief.json` from the template and the learning notes at the
 * run's cutoff (SPEC 0003 R2-07); postcondition "exists and validates". A failed notes read fails
 * the step with a named reason: a brief is never written without the notes it should quote.
 */
@Injectable()
export class BriefStep implements StepHandler {
  readonly step: StepName = 'brief';

  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(StageBriefComposer) private readonly composer: StageBriefComposer,
  ) {}

  async run({ workspace }: StepContext): Promise<StepOutcome> {
    const brief = await this.composeBrief(workspace);
    if (brief instanceof LearningNotesUnavailableError) {
      return postconditionFailed(this.step, ownerTexts.learningsReadFailed(brief.causeName));
    }
    try {
      await writeStageBrief(workspace.runDir, brief);
      workspace.rememberBrief(await readStageBrief(workspace.runDir, workspace.location));
    } catch (error) {
      if (error instanceof RunFileSchemaError) return postconditionFailed(this.step, error.problems.slice(0, 3).join('; '));
      throw error;
    }
    return { kind: 'passed', detail: ownerTexts.briefRendered(STAGE_BRIEF_TEMPLATE_ID) };
  }

  /** The learnings read failure is returned, not thrown, so `run` turns it into the step outcome. */
  private async composeBrief(workspace: StageWorkspace): Promise<StageBrief | LearningNotesUnavailableError> {
    try {
      return await this.composer.compose({
        run: workspace.active.snapshot,
        location: workspace.location,
        recipeStage: workspace.recipeStage(),
        declaredOutputs: workspace.executor.declaredOutputs(workspace.planningContext()),
        renderedAt: this.clock.now(),
      });
    } catch (error) {
      if (error instanceof LearningNotesUnavailableError) return error;
      throw error;
    }
  }
}
