import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { StageExecutionContext, StageExecutionResult, StagePlanningContext } from '@studio/shared/ports';
import { resolveInsideRun } from '@studio/shared/run-files';
import { type CheckId, type DeclaredOutput, type StageEstimate } from '@studio/shared/run-format';
import { captionTimingEvidence, recordedCaptionDrift } from '../media/caption-timing.evidence';
import { captionCues, toSrt } from '../media/captions-srt';
import { MediaWriteResultSchema } from '../process/tool-runner.protocol';
import { BaseStageExecutor, zeroEstimate } from '../shared/base-stage.executor';
import { latestVideoInput } from '../shared/latest-video';
import { withScratchDir } from '../shared/scratch-dir';
import { NarrationIndexSchema } from '../shared/stage-artifacts';
import { readOptionalStageInput, stageOutput, type StageOutputSink } from '../shared/stage-io';
import { commandTimeoutMs, needsPerson, reportedSuccess, stageFailed, toolFailure, type CheckEvidence, type CheckEvidenceMap } from '../shared/stage-results';
import { mediaToolPaths } from '../shared/stage-settings';
import { stageTexts } from '../shared/stage-texts';

/**
 * `captions`: an SRT built from the narration's word timings, burned into the latest video by the
 * C9 `caption-burn` command at the recipe's caption band (`format.captions.yPercent`).
 */
export class CaptionsExecutor extends BaseStageExecutor {
  readonly stageId = 'captions';
  protected readonly faultProvider = 'render';

  async estimate(): Promise<StageEstimate> {
    return zeroEstimate;
  }

  declaredOutputs(context: StagePlanningContext): readonly DeclaredOutput[] {
    return [
      stageOutput(context.stage, 'captions', 'captions.srt', 'application/x-subrip'),
      stageOutput(context.stage, 'captions-video', 'captions.mp4', 'video/mp4'),
    ];
  }

  protected async checkEvidence(context: StageExecutionContext, checks: readonly CheckId[]): Promise<CheckEvidenceMap> {
    const evidence = new Map<CheckId, CheckEvidence>();
    if (checks.includes('caption-timing')) {
      const srtPath = context.stageBrief.declaredOutputs.find((output) => output.name === 'captions')?.path ?? null;
      evidence.set('caption-timing', captionTimingEvidence(context, await recordedCaptionDrift(context, srtPath)));
    }
    return evidence;
  }

  protected async run(context: StageExecutionContext, outputs: StageOutputSink): Promise<StageExecutionResult> {
    const ownerStop = (message: string): StageExecutionResult =>
      stageFailed(needsPerson({ kind: 'needs-person', stepKey: context.stepKey }, message, stageTexts.missingInputWhatToDo));
    const narration = await readOptionalStageInput(context, 'narration-index', NarrationIndexSchema);
    if (narration === null) return ownerStop(stageTexts.missingInput('narration-index'));
    const video = latestVideoInput(context);
    if (video === undefined) return ownerStop(stageTexts.noVideoInput);

    const cues = captionCues(narration.words, context.recipe.format.captions.maxLines);
    const srtText = toSrt(cues);
    await outputs.writeBytes('captions', srtText);
    context.report({ kind: 'tool', text: `Aplicando ${cues.length} legenda(s).` });
    const burned = await withScratchDir(this.dependencies.settings, async (directory) => {
      // The burn reads its own copy: the run file is written through C5 and may be faulted out.
      const srt = join(directory, 'captions.srt');
      await writeFile(srt, srtText);
      const output = join(directory, 'captions.mp4');
      const result = await this.dependencies.runner.run(
        {
          command: 'caption-burn',
          tools: mediaToolPaths(this.dependencies.settings),
          input: resolveInsideRun(context.runDir, video.path),
          output,
          srt,
          verticalAnchor: context.recipe.format.captions.yPercent / 100,
        },
        MediaWriteResultSchema,
        { signal: context.signal, timeoutMs: commandTimeoutMs(context) },
      );
      if (result.status === 'ok') await outputs.adoptFile('captions-video', output);
      return result;
    });
    if (burned.status === 'failed') return stageFailed(toolFailure(burned, context));
    return reportedSuccess(`${cues.length} legenda(s) aplicada(s) sobre ${video.name}.`);
  }
}
