import { z } from 'zod';
import { detectBlackRuns } from '../../media/black-runs';
import type { Interval } from '../../media/ffmpeg';
import { measureLoudness, type LoudnessMeasurement } from '../../media/loudness';
import { filePathArg, numberArg, parseCommandArgs } from '../../media/media-args';
import { resolveInputFile } from '../../media/media-paths';
import { probeMediaDetails } from '../../media/media-probe';
import { mediaChecks, type MediaCheckResult } from '../../media/media-review-checks';
import type { MediaToolPaths } from '../../media/media-tools';

const codecName = z.string().trim().regex(/^[a-z0-9_]{1,32}$/, 'codec names are lowercase ffprobe names such as h264 or aac');

/**
 * Contract C9 `media-review` arguments. Format values (resolution, fps, duration range) have no
 * default because they come from the recipe. Loudness defaults are RELATORIO.md's targets:
 * -16 LUFS +/- 1 LU and true peak at most -1 dBFS.
 */
export const MediaReviewArgsSchema = z
  .object({
    input: filePathArg,
    container: z.enum(['mp4', 'mov']).default('mp4'),
    videoCodec: codecName.default('h264'),
    audioCodec: codecName.default('aac'),
    width: numberArg(z.number().int().min(16).max(8192)),
    height: numberArg(z.number().int().min(16).max(8192)),
    fps: numberArg(z.number().gt(0).max(240)),
    minDurationS: numberArg(z.number().min(0).max(36_000)),
    maxDurationS: numberArg(z.number().gt(0).max(36_000)),
    loudnessTargetLufs: numberArg(z.number().min(-30).max(-8)).default(-16),
    loudnessToleranceLu: numberArg(z.number().gt(0).max(6)).default(1),
    truePeakCeilingDbfs: numberArg(z.number().min(-20).max(0)).default(-1),
    maxBlackRunS: numberArg(z.number().min(0.1).max(60)).default(1),
  })
  .strict()
  .refine((args) => args.minDurationS <= args.maxDurationS, { message: 'minDurationS must not exceed maxDurationS', path: ['minDurationS'] });
export type MediaReviewArgs = z.input<typeof MediaReviewArgsSchema>;

export interface MediaReviewResult {
  command: 'media-review';
  file: string;
  /** True only when every check passed; every check is blocking (PRD 7.3). */
  passed: boolean;
  checks: MediaCheckResult[];
  measured: {
    containerNames: string[];
    durationS: number;
    video: { codec: string; width: number; height: number; fps: number } | null;
    audio: { codec: string; sampleRate: number } | null;
    integratedLufs: number | null;
    truePeakDbfs: number | null;
    blackRuns: Interval[];
  };
}

/**
 * Reviews a finished MP4 against the recipe's format and the loudness targets (port and extension
 * of video_tool.py `review`, which checked only streams, duration and loudness).
 */
export async function runMediaReview(tools: MediaToolPaths, rawArgs: unknown): Promise<MediaReviewResult> {
  const args = parseCommandArgs(MediaReviewArgsSchema, rawArgs, 'media-review');
  const file = await resolveInputFile(args.input, 'input video');
  const probe = await probeMediaDetails(tools.ffprobePath, file);
  const loudness: LoudnessMeasurement | null = probe.audio ? await measureLoudness(tools.ffmpegPath, file) : null;
  const blackRuns = probe.video ? await detectBlackRuns(tools.ffmpegPath, file, args.maxBlackRunS) : [];
  const checks = mediaChecks(args, { probe, loudness, blackRuns });
  return {
    command: 'media-review',
    file,
    passed: checks.every((check) => check.passed),
    checks,
    measured: {
      containerNames: probe.containerNames,
      durationS: probe.durationS,
      video: probe.video,
      audio: probe.audio,
      integratedLufs: loudness?.integratedLufs ?? null,
      truePeakDbfs: loudness?.truePeakDbfs ?? null,
      blackRuns,
    },
  };
}
