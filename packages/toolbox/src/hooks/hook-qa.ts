import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hookSpec, type HookTimeline } from '@studio/shared/ace';
import { runTool } from '../media/exec-tool';
import { detectBlackAndSilence } from '../media/ffmpeg';
import { probeMedia } from '../media/ffprobe';
import { measureEbur128 } from './audio/mixdown';

const SHEET_TIMEOUT_MS = 2 * 60_000;
const DURATION_TOLERANCE_S = 0.15;
const SHEET_CELL = { width: 270, height: 480 };

export interface HookCheck {
  name: string;
  pass: boolean;
  detail: string;
}

export interface HookQaReport {
  pass: boolean;
  checks: HookCheck[];
  integratedLufs: number;
  truePeakDb: number;
  durationS: number;
  contactSheet: string;
}

/** One frame from the middle of every shot, side by side, for a quick human look. */
async function writeContactSheet(ffmpegPath: string, videoPath: string, timeline: HookTimeline, outPath: string): Promise<void> {
  const inputs = timeline.shots.flatMap((shot) => ['-ss', ((shot.startS + shot.endS) / 2).toFixed(3), '-i', videoPath]);
  const scaled = timeline.shots.map((_, index) => `[${index}:v]scale=${SHEET_CELL.width}:${SHEET_CELL.height}[s${index}]`);
  const stacked = `${timeline.shots.map((_, index) => `[s${index}]`).join('')}hstack=inputs=${timeline.shots.length}[sheet]`;
  await runTool(
    ffmpegPath,
    ['-hide_banner', '-nostats', '-y', ...inputs, '-filter_complex', [...scaled, stacked].join(';'), '-map', '[sheet]', '-frames:v', '1', outPath],
    SHEET_TIMEOUT_MS,
  );
}

/**
 * Technical QA of the exported MP4: size and frame rate, duration against the timeline,
 * loudness on the encoded audio (-14 LUFS +/- 1, true peak <= -1.5 dBTP) and no black runs.
 */
export async function checkHookVideo(options: { ffmpegPath: string; ffprobePath: string; videoPath: string; timeline: HookTimeline; outDir: string }): Promise<HookQaReport> {
  const { ffmpegPath, ffprobePath, videoPath, timeline, outDir } = options;
  const probe = await probeMedia(ffprobePath, videoPath);
  const loudness = await measureEbur128(ffmpegPath, videoPath);
  const detection = await detectBlackAndSilence(ffmpegPath, videoPath, probe.durationS);
  const contactSheet = join(outDir, 'contact-sheet.png');
  await writeContactSheet(ffmpegPath, videoPath, timeline, contactSheet);

  const video = probe.video;
  const checks: HookCheck[] = [
    {
      name: 'frame',
      pass: video !== null && video.width === hookSpec.video.width && video.height === hookSpec.video.height && Math.abs(video.fps - hookSpec.fps) < 0.01,
      detail: video ? `${video.width}x${video.height} @ ${video.fps} fps` : 'no video stream',
    },
    { name: 'audio', pass: probe.audio !== null, detail: probe.audio ? `${probe.audio.codec} ${probe.audio.sampleRate} Hz` : 'no audio stream' },
    {
      name: 'duration',
      pass: Math.abs(probe.durationS - timeline.durationS) <= DURATION_TOLERANCE_S && probe.durationS >= hookSpec.minDurationS && probe.durationS <= hookSpec.maxDurationS,
      detail: `${probe.durationS.toFixed(2)} s (timeline ${timeline.durationS.toFixed(2)} s)`,
    },
    {
      name: 'loudness',
      pass: Math.abs(loudness.integratedLufs - hookSpec.targetLufs) <= hookSpec.lufsTolerance,
      detail: `${loudness.integratedLufs.toFixed(1)} LUFS (target ${hookSpec.targetLufs} +/- ${hookSpec.lufsTolerance})`,
    },
    { name: 'true-peak', pass: loudness.truePeakDb <= hookSpec.maxTruePeakDb, detail: `${loudness.truePeakDb.toFixed(1)} dBTP (max ${hookSpec.maxTruePeakDb})` },
    {
      name: 'black-frames',
      pass: detection.black.length === 0,
      detail: detection.black.length === 0 ? 'none over 1 s' : detection.black.map((run) => `${run.startS.toFixed(1)}-${run.endS.toFixed(1)} s`).join(', '),
    },
  ];
  const report: HookQaReport = {
    pass: checks.every((check) => check.pass),
    checks,
    integratedLufs: loudness.integratedLufs,
    truePeakDb: loudness.truePeakDb,
    durationS: probe.durationS,
    contactSheet,
  };
  await writeFile(join(outDir, 'qa.json'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
