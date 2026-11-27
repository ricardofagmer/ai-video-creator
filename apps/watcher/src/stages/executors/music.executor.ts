import { join } from 'node:path';
import { type MusicCategory } from '@studio/shared/catalog';
import type { StageExecutionContext, StageExecutionResult, StageFailure, StagePlanningContext } from '@studio/shared/ports';
import { resolveInsideRun } from '@studio/shared/run-files';
import { type DeclaredOutput, type StageEstimate, type StageInput, type WaitingCause } from '@studio/shared/run-format';
import { MediaWriteResultSchema } from '../process/tool-runner.protocol';
import { autoMusicOutputs, autoMusicTrack } from '../music/music-auto';
import { autoMusicCategories, listMusicOptions } from '../music/music-candidates';
import { generationLengthMs, musicGenerator } from '../music/music-generation';
import { priceMusicGeneration } from '../music/music-generation-cost';
import { BaseStageExecutor, zeroEstimate } from '../shared/base-stage.executor';
import { boundOfKind } from '../shared/catalog-lookup';
import { latestVideoInput } from '../shared/latest-video';
import { withScratchDir } from '../shared/scratch-dir';
import { stageOutput, type StageOutputSink } from '../shared/stage-io';
import { commandTimeoutMs, needsPerson, reportedSuccess, stageFailed, toolFailure, type CheckEvidenceMap } from '../shared/stage-results';
import { stageTexts } from '../shared/stage-texts';

/** C9 `music-bed` argument ranges (`packages/toolbox/src/commands/media/README.md`). */
const LOUDNESS_RANGE = { min: -30, max: -8 };
const TRUE_PEAK_RANGE = { min: -9, max: -1 };

function clamp(value: number, range: { min: number; max: number }): number {
  return Math.min(range.max, Math.max(range.min, value));
}

/** The track to mix, what the activity line calls it, and how the success summary ends. */
type TrackToMix = { status: 'ready'; absolutePath: string; label: string; summary: string | null } | { status: 'refused'; failure: StageFailure };

/**
 * `music`: a track mixed under the latest video by the C9 `music-bed` command, to the recipe's
 * loudness and true-peak targets (clamped to the command's accepted range). `track` mode (the
 * default) mixes the bound track from the path the engine re-hashed at `preflight`; `auto` mode
 * picks a catalog track by category or generates one (docs/specs/2026-11-25-ai-music-choice-design.md).
 */
export class MusicExecutor extends BaseStageExecutor {
  readonly stageId = 'music';
  protected readonly faultProvider = 'render';

  /**
   * Auto mode costs money only when no catalog track fits and ElevenLabs generates live; every
   * other path is local. The track is priced for the video's target length (the narration, which
   * sets the real length, may not exist yet). The listing is skipped while generation has no
   * price (it would add 0).
   */
  async estimate(context: StagePlanningContext): Promise<StageEstimate> {
    const categories = autoMusicCategories(context.params);
    if (categories === null || musicGenerator(this.dependencies) !== 'elevenlabs') return zeroEstimate;
    const price = priceMusicGeneration(this.dependencies.ledger, generationLengthMs(context.brief.targetDurationSec * 1000));
    if (price.status === 'unpriced') return zeroEstimate;
    const generation = { ...zeroEstimate, usd: price.usd };
    try {
      const options = await listMusicOptions(context, this.dependencies.catalog, categories);
      return options.length > 0 ? zeroEstimate : generation;
    } catch {
      // C6: an estimate never throws, and it errs high: an unreadable catalog may mean a paid generation.
      return generation;
    }
  }

  declaredOutputs(context: StagePlanningContext): readonly DeclaredOutput[] {
    const mixed = stageOutput(context.stage, 'music', 'music.mp4', 'video/mp4');
    return autoMusicCategories(context.params) === null ? [mixed] : [mixed, ...autoMusicOutputs(context, this.dependencies)];
  }

  protected async checkEvidence(): Promise<CheckEvidenceMap> {
    return new Map();
  }

  protected async run(context: StageExecutionContext, outputs: StageOutputSink): Promise<StageExecutionResult> {
    const cause: WaitingCause = { kind: 'needs-person', stepKey: context.stepKey };
    const video = latestVideoInput(context);
    if (video === undefined) return stageFailed(needsPerson(cause, stageTexts.noVideoInput, stageTexts.missingInputWhatToDo));
    const categories = autoMusicCategories(context.params);
    const track = categories === null ? boundTrack(context, cause) : await this.autoTrack(context, outputs, categories);
    if (track.status === 'refused') return stageFailed(track.failure);
    return this.mix(context, outputs, { video, track });
  }

  private async autoTrack(context: StageExecutionContext, outputs: StageOutputSink, categories: readonly MusicCategory[]): Promise<TrackToMix> {
    const auto = await autoMusicTrack({ context, dependencies: this.dependencies, outputs, categories });
    if (auto.status === 'refused') return auto;
    const label = auto.record.source === 'catalog' ? auto.record.ref : 'gerada';
    return { status: 'ready', absolutePath: auto.absolutePath, label, summary: auto.summary };
  }

  private async mix(
    context: StageExecutionContext,
    outputs: StageOutputSink,
    request: { video: StageInput; track: Extract<TrackToMix, { status: 'ready' }> },
  ): Promise<StageExecutionResult> {
    const { video, track } = request;
    const { integratedLufs, truePeakDbtp } = context.recipe.format.loudness;
    context.report({ kind: 'tool', text: `Mixando a trilha ${track.label}.` });
    const mixed = await withScratchDir(this.dependencies.settings, async (directory) => {
      const output = join(directory, 'music.mp4');
      const result = await this.dependencies.runner.run(
        {
          command: 'music-bed',
          input: resolveInsideRun(context.runDir, video.path),
          output,
          music: track.absolutePath,
          loudnessTargetLufs: clamp(integratedLufs, LOUDNESS_RANGE),
          truePeakTargetDb: clamp(truePeakDbtp, TRUE_PEAK_RANGE),
        },
        MediaWriteResultSchema,
        { signal: context.signal, timeoutMs: commandTimeoutMs(context), readRoots: [context.runDir, track.absolutePath] },
      );
      if (result.status === 'ok') await outputs.adoptFile('music', output);
      return result;
    });
    if (mixed.status === 'failed') return stageFailed(toolFailure(mixed, context));
    const mixedText = `Trilha ${track.label} mixada sob ${video.name}.`;
    return reportedSuccess(track.summary === null ? mixedText : `${mixedText} ${track.summary}`);
  }
}

/** Track mode, unchanged: the recipe's bound `music` slot, a single file. */
function boundTrack(context: StageExecutionContext, cause: WaitingCause): TrackToMix {
  const track = boundOfKind(context, 'music', 'music');
  if (track === null || track.asset.layout !== 'file') return { status: 'refused', failure: needsPerson(cause, stageTexts.musicNotBound, stageTexts.musicNotBoundWhatToDo) };
  return { status: 'ready', absolutePath: track.asset.absolutePath, label: track.asset.ref, summary: null };
}
