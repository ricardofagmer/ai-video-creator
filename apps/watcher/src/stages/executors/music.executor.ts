import { join } from 'node:path';
import type { StageExecutionContext, StageExecutionResult, StagePlanningContext } from '@studio/shared/ports';
import { resolveInsideRun } from '@studio/shared/run-files';
import { type DeclaredOutput, type StageEstimate, type WaitingCause } from '@studio/shared/run-format';
import { MediaWriteResultSchema } from '../process/tool-runner.protocol';
import { BaseStageExecutor, zeroEstimate } from '../shared/base-stage.executor';
import { boundOfKind } from '../shared/catalog-lookup';
import { latestVideoInput } from '../shared/latest-video';
import { withScratchDir } from '../shared/scratch-dir';
import { stageOutput, type StageOutputSink } from '../shared/stage-io';
import { commandTimeoutMs, needsPerson, reportedSuccess, stageFailed, toolFailure, type CheckEvidenceMap } from '../shared/stage-results';
import { mediaToolPaths } from '../shared/stage-settings';
import { stageTexts } from '../shared/stage-texts';

/** C9 `music-bed` argument ranges (`packages/toolbox/src/commands/media/README.md`). */
const LOUDNESS_RANGE = { min: -30, max: -8 };
const TRUE_PEAK_RANGE = { min: -9, max: -1 };

function clamp(value: number, range: { min: number; max: number }): number {
  return Math.min(range.max, Math.max(range.min, value));
}

/**
 * `music`: the bound music track mixed under the latest video by the C9 `music-bed` command, to
 * the recipe's loudness and true-peak targets (clamped to the command's accepted range). The
 * track is read from the path the engine re-hashed at `preflight`.
 */
export class MusicExecutor extends BaseStageExecutor {
  readonly stageId = 'music';
  protected readonly faultProvider = 'render';

  async estimate(): Promise<StageEstimate> {
    return zeroEstimate;
  }

  declaredOutputs(context: StagePlanningContext): readonly DeclaredOutput[] {
    return [stageOutput(context.stage, 'music', 'music.mp4', 'video/mp4')];
  }

  protected async checkEvidence(): Promise<CheckEvidenceMap> {
    return new Map();
  }

  protected async run(context: StageExecutionContext, outputs: StageOutputSink): Promise<StageExecutionResult> {
    const cause: WaitingCause = { kind: 'needs-person', stepKey: context.stepKey };
    const video = latestVideoInput(context);
    if (video === undefined) return stageFailed(needsPerson(cause, stageTexts.noVideoInput, stageTexts.missingInputWhatToDo));
    const track = boundOfKind(context, 'music', 'music');
    if (track === null || track.asset.layout !== 'file') return stageFailed(needsPerson(cause, stageTexts.musicNotBound, stageTexts.musicNotBoundWhatToDo));

    const { integratedLufs, truePeakDbtp } = context.recipe.format.loudness;
    context.report({ kind: 'tool', text: `Mixando a trilha ${track.asset.ref}.` });
    const mixed = await withScratchDir(this.dependencies.settings, async (directory) => {
      const output = join(directory, 'music.mp4');
      const result = await this.dependencies.runner.run(
        {
          command: 'music-bed',
          tools: mediaToolPaths(this.dependencies.settings),
          input: resolveInsideRun(context.runDir, video.path),
          output,
          music: track.asset.absolutePath,
          loudnessTargetLufs: clamp(integratedLufs, LOUDNESS_RANGE),
          truePeakTargetDb: clamp(truePeakDbtp, TRUE_PEAK_RANGE),
        },
        MediaWriteResultSchema,
        { signal: context.signal, timeoutMs: commandTimeoutMs(context) },
      );
      if (result.status === 'ok') await outputs.adoptFile('music', output);
      return result;
    });
    if (mixed.status === 'failed') return stageFailed(toolFailure(mixed, context));
    return reportedSuccess(`Trilha ${track.asset.ref} mixada sob ${video.name}.`);
  }
}
