import { join } from 'node:path';
import type { StageExecutionContext, StageExecutionResult, StagePlanningContext } from '@studio/shared/ports';
import { resolveInsideRun } from '@studio/shared/run-files';
import { type DeclaredOutput, type StageEstimate } from '@studio/shared/run-format';
import { MediaWriteResultSchema } from '../process/tool-runner.protocol';
import { BaseStageExecutor, zeroEstimate } from '../shared/base-stage.executor';
import { latestVideoInput } from '../shared/latest-video';
import { withScratchDir } from '../shared/scratch-dir';
import { stageOutput, type StageOutputSink } from '../shared/stage-io';
import { commandTimeoutMs, needsPerson, reportedSuccess, stageFailed, toolFailure, type CheckEvidenceMap } from '../shared/stage-results';
import { stageTexts } from '../shared/stage-texts';

/** `fades`: the C9 `fades` command (fade in and out of picture and sound) over the latest video. */
export class FadesExecutor extends BaseStageExecutor {
  readonly stageId = 'fades';
  protected readonly faultProvider = 'render';

  async estimate(): Promise<StageEstimate> {
    return zeroEstimate;
  }

  declaredOutputs(context: StagePlanningContext): readonly DeclaredOutput[] {
    return [stageOutput(context.stage, 'fades', 'fades.mp4', 'video/mp4')];
  }

  protected async checkEvidence(): Promise<CheckEvidenceMap> {
    return new Map();
  }

  protected async run(context: StageExecutionContext, outputs: StageOutputSink): Promise<StageExecutionResult> {
    const video = latestVideoInput(context);
    if (video === undefined) {
      return stageFailed(needsPerson({ kind: 'needs-person', stepKey: context.stepKey }, stageTexts.noVideoInput, stageTexts.missingInputWhatToDo));
    }
    const faded = await withScratchDir(this.dependencies.settings, async (directory) => {
      const output = join(directory, 'fades.mp4');
      const result = await this.dependencies.runner.run(
        { command: 'fades', input: resolveInsideRun(context.runDir, video.path), output },
        MediaWriteResultSchema,
        { signal: context.signal, timeoutMs: commandTimeoutMs(context), readRoots: [context.runDir] },
      );
      if (result.status === 'ok') await outputs.adoptFile('fades', output);
      return result;
    });
    if (faded.status === 'failed') return stageFailed(toolFailure(faded, context));
    return reportedSuccess(`Transições de entrada e saída aplicadas sobre ${video.name}.`);
  }
}
