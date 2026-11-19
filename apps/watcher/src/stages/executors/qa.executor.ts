import type { StageExecutionContext, StageExecutionResult, StagePlanningContext } from '@studio/shared/ports';
import { resolveInsideRun } from '@studio/shared/run-files';
import { QaMetricsSchema, runFileNames, type CheckId, type DeclaredOutput, type StageEstimate } from '@studio/shared/run-format';
import { captionTimingEvidence, maxCaptionDriftMs, recordedCaptionDrift, recordedSrtPath } from '../media/caption-timing.evidence';
import { type CaptionDrift } from '../media/captions-srt';
import { failedMediaChecks, mediaCheckEvidence, mediaReviewTargets, toQaMetrics } from '../media/media-checks.mapper';
import { MediaReviewResultSchema } from '../process/tool-runner.protocol';
import { BaseStageExecutor, zeroEstimate } from '../shared/base-stage.executor';
import { latestVideoInput } from '../shared/latest-video';
import { QaSubjectSchema } from '../shared/stage-artifacts';
import { readOwnOutput, sha256OfFile, stageOutput, type StageOutputSink } from '../shared/stage-io';
import { commandTimeoutMs, needsPerson, reportedSuccess, stageFailed, toolFailure, type CheckEvidence, type CheckEvidenceMap } from '../shared/stage-results';
import { mediaToolPaths } from '../shared/stage-settings';
import { stageTexts } from '../shared/stage-texts';

const JSON_MIME = 'application/json';

/**
 * `qa`: technical QA of the most finished video by the C9 `media-review` command (container,
 * codecs, resolution, fps, duration, audio present, loudness, true peak, black runs) plus the
 * caption drift. The checks fail at `verify`; `qa-subject` pins the measured file by hash so
 * `package` ships exactly that file and only when it passed, so a bad MP4 never reaches `review`.
 */
export class QaExecutor extends BaseStageExecutor {
  readonly stageId = 'qa';
  protected readonly faultProvider = 'render';

  async estimate(): Promise<StageEstimate> {
    return zeroEstimate;
  }

  declaredOutputs(context: StagePlanningContext): readonly DeclaredOutput[] {
    return [
      stageOutput(context.stage, 'qa-metrics', 'metrics.json', JSON_MIME),
      { name: 'media-review', path: runFileNames.qaMediaReview, mimeType: JSON_MIME },
      stageOutput(context.stage, 'qa-subject', 'qa-subject.json', JSON_MIME),
    ];
  }

  protected async checkEvidence(context: StageExecutionContext, checks: readonly CheckId[]): Promise<CheckEvidenceMap> {
    const evidence = new Map<CheckId, CheckEvidence>();
    const review = await readOwnOutput(context, 'media-review', MediaReviewResultSchema);
    for (const checkId of checks) {
      const measured = mediaCheckEvidence(checkId, review);
      if (measured !== null) evidence.set(checkId, measured);
    }
    if (checks.includes('caption-timing')) {
      evidence.set('caption-timing', captionTimingEvidence(context, await recordedCaptionDrift(context, recordedSrtPath(context))));
    }
    return evidence;
  }

  protected async run(context: StageExecutionContext, outputs: StageOutputSink): Promise<StageExecutionResult> {
    const ownerStop = (message: string): StageExecutionResult =>
      stageFailed(needsPerson({ kind: 'needs-person', stepKey: context.stepKey }, message, stageTexts.qaNotPassedWhatToDo));
    const video = latestVideoInput(context);
    if (video === undefined) return ownerStop(stageTexts.noVideoInput);
    const absolutePath = resolveInsideRun(context.runDir, video.path);
    const contentHash = await sha256OfFile(absolutePath);
    const drift = await recordedCaptionDrift(context, recordedSrtPath(context));
    context.report({ kind: 'tool', text: `Medindo ${video.name} (QA técnico).` });

    const reviewed = await this.dependencies.runner.run(
      { command: 'media-review', tools: mediaToolPaths(this.dependencies.settings), input: absolutePath, ...mediaReviewTargets(context) },
      MediaReviewResultSchema,
      { signal: context.signal, timeoutMs: commandTimeoutMs(context) },
    );
    if (reviewed.status === 'failed') return stageFailed(toolFailure(reviewed, context));
    const review = reviewed.result;
    await outputs.writeJson('media-review', MediaReviewResultSchema, review);

    const metrics = toQaMetrics(review, drift);
    const failed = failedMediaChecks(review);
    if (!captionsWithinDrift(context, drift)) failed.push('caption-timing');
    if (metrics === null) failed.push('video-stream');
    const passed = review.passed && failed.length === 0;
    await outputs.writeJson('qa-subject', QaSubjectSchema, { format: 1, path: video.path, contentHash, passed });
    if (metrics === null) return ownerStop(stageTexts.qaFailed(failed));
    await outputs.writeJson('qa-metrics', QaMetricsSchema, metrics);
    return reportedSuccess(passed ? `QA técnico aprovou ${video.name}.` : stageTexts.qaFailed(failed));
  }
}

/** No captions is not a drift; a measured drift above the recipe limit or a cue mismatch is. */
function captionsWithinDrift(context: StageExecutionContext, drift: CaptionDrift | null): boolean {
  if (drift === null) return true;
  return drift.status === 'measured' && drift.driftMs <= maxCaptionDriftMs(context);
}
