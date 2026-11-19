import type { StageExecutionContext } from '@studio/shared/ports';
import { type CheckId, type QaMetrics } from '@studio/shared/run-format';
import { type MediaReviewResult } from '../process/tool-runner.protocol';
import { type CheckEvidence } from '../shared/stage-results';
import { type CaptionDrift } from './captions-srt';

/** Used when the recipe defines no `black-frames` threshold. */
const DEFAULT_MAX_BLACK_RUN_MS = 500;

/** C9 `media-review` check ids measured for each C3 check id. */
const mediaChecksOf: Readonly<Partial<Record<CheckId, readonly string[]>>> = {
  container: ['container'],
  codec: ['video-codec', 'audio-codec'],
  resolution: ['resolution'],
  fps: ['fps'],
  duration: ['duration'],
  'audio-present': ['audio-present'],
  loudness: ['loudness'],
  'true-peak': ['true-peak'],
  'black-frames': ['no-black-run'],
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The C9 `media-review` arguments from the recipe format and check definitions. */
export function mediaReviewTargets(context: StageExecutionContext): {
  container: 'mp4' | 'mov';
  videoCodec: string;
  audioCodec: string;
  width: number;
  height: number;
  fps: number;
  minDurationS: number;
  maxDurationS: number;
  loudnessTargetLufs: number;
  loudnessToleranceLu: number;
  truePeakCeilingDbfs: number;
  maxBlackRunS: number;
} {
  const { format, checks } = context.recipe;
  let container: 'mp4' | 'mov' = 'mp4';
  let videoCodec = 'h264';
  let audioCodec = 'aac';
  let maxBlackRunMs = DEFAULT_MAX_BLACK_RUN_MS;
  for (const check of checks) {
    if (check.id === 'container' && !check.formats.includes('mp4') && check.formats.includes('mov')) container = 'mov';
    if (check.id === 'codec') {
      videoCodec = check.video;
      audioCodec = check.audio;
    }
    if (check.id === 'black-frames') maxBlackRunMs = check.maxRunMs;
  }
  return {
    container,
    videoCodec,
    audioCodec,
    width: format.canvas.width,
    height: format.canvas.height,
    fps: format.fps,
    minDurationS: format.duration.minSec,
    maxDurationS: format.duration.maxSec,
    loudnessTargetLufs: clamp(format.loudness.integratedLufs, -30, -8),
    loudnessToleranceLu: clamp(format.loudness.toleranceLu, 0.1, 6),
    truePeakCeilingDbfs: clamp(format.loudness.truePeakDbtp, -20, 0),
    maxBlackRunS: clamp(maxBlackRunMs / 1000, 0.1, 60),
  };
}

/** C3 metrics of the measured file; null when it has no video stream at all (not a video). */
export function toQaMetrics(review: MediaReviewResult, drift: CaptionDrift | null): QaMetrics | null {
  const { measured } = review;
  if (measured.video === null || measured.video.width <= 0 || measured.video.height <= 0 || measured.video.fps <= 0) return null;
  const audio: QaMetrics['audio'] =
    measured.audio !== null && measured.integratedLufs !== null && measured.truePeakDbfs !== null
      ? {
          status: 'present',
          codec: measured.audio.codec.slice(0, 40),
          integratedLufs: clamp(measured.integratedLufs, -99, 10),
          truePeakDbtp: clamp(measured.truePeakDbfs, -99, 20),
        }
      : { status: 'absent' };
  return {
    container: (measured.containerNames[0] ?? 'unknown').slice(0, 40),
    videoCodec: measured.video.codec.slice(0, 40),
    durationMs: Math.round(measured.durationS * 1000),
    width: Math.round(measured.video.width),
    height: Math.round(measured.video.height),
    fps: measured.video.fps,
    audio,
    blackRuns: measured.blackRuns.slice(0, 1000).map((run) => ({ startMs: Math.round(run.startS * 1000), durationMs: Math.round(run.durationS * 1000) })),
    captionMaxDriftMs: drift?.status === 'measured' ? drift.driftMs : null,
  };
}

/** Evidence for one C3 media check from the recorded media review; a missing measure is an error. */
export function mediaCheckEvidence(checkId: CheckId, review: MediaReviewResult | null): CheckEvidence | null {
  const mediaIds = mediaChecksOf[checkId];
  if (mediaIds === undefined) return null;
  if (review === null) return { outcome: 'error', expected: mediaIds.join(', '), measured: 'revisão de mídia ausente', detail: '' };
  const measured = mediaIds.map((id) => review.checks.find((check) => check.id === id));
  const missing = mediaIds.filter((_id, index) => measured[index] === undefined);
  if (missing.length > 0) return { outcome: 'error', expected: mediaIds.join(', '), measured: `não medido: ${missing.join(', ')}`, detail: '' };
  const found = measured.flatMap((check) => (check === undefined ? [] : [check]));
  return {
    outcome: found.every((check) => check.passed) ? 'passed' : 'failed',
    expected: found.map((check) => check.expected).join('; '),
    measured: found.map((check) => check.actual).join('; '),
    detail: found.filter((check) => !check.passed).map((check) => check.id).join(', '),
  };
}

/** Media check ids that failed in the review, for the owner-facing summary. */
export function failedMediaChecks(review: MediaReviewResult): string[] {
  return review.checks.filter((check) => !check.passed).map((check) => check.id);
}
