import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { referenceAnalysisBounds } from '@studio/shared/asset-jobs';
import { minimalChildEnv } from '../stages/process/child-env';
import { fileInputArgs } from '../stages/process/runner/ffmpeg-input';
import { commandSignal, spawnBounded, type BoundedSpawnOutcome } from '../stages/process/spawn-bounded';
import { withScratchDir } from '../stages/shared/scratch-dir';
import { type StageSettings } from '../stages/shared/stage-settings';
import { FRAME_COMMAND_TIMEOUT_MS } from './asset-job-signals';

/** ffprobe prints one number; anything longer is not its answer. */
const MAX_PROBE_STDOUT_BYTES = 4_096;
/** A JPEG starts with SOI and a marker; the analyst refuses anything else. */
const JPEG_MAGIC: readonly number[] = [0xff, 0xd8, 0xff];
/** ffmpeg's JPEG quality scale (2 best, 31 worst); 5 keeps a 1280 px frame well under `frameMaxBytes`. */
const JPEG_QUALITY = '5';

export type FrameSampleFailure = 'tool-missing' | 'media-unreadable' | 'timed-out';

export type FrameSample =
  | { status: 'sampled'; frames: Uint8Array[]; durationMs: number; bytes: number }
  | { status: 'failed'; code: FrameSampleFailure }
  /** The job's own signal fired; the step names the ending. */
  | { status: 'aborted' };

type CommandFailure = Exclude<FrameSample, { status: 'sampled' }>;

/**
 * Samples `referenceAnalysisBounds.frames` frames evenly across a stored reference video, read-only,
 * each scaled to at most `frameMaxWidthPx` wide and encoded as JPEG. Frame `i` of `n` is taken at
 * `(i + 0.5) / n` of the duration, so the first and last frames are never black lead-in or tail.
 *
 * Watcher-local on purpose: core's `ffmpeg-frames` helpers are not exported and pick the demuxer by
 * file extension, which a stored blob (no extension) never has. Here every input goes through the
 * runner's guard (`-protocol_whitelist file`, the demuxer allowlist), the seek is a number the
 * sampler computed, the child gets the minimal environment, no shell parses the argv, and each
 * command is bounded by `FRAME_COMMAND_TIMEOUT_MS` and the job signal. The frames go to a private
 * scratch folder that is removed afterwards. A frame over `frameMaxBytes`, not a JPEG or not
 * produced is dropped; none left means `media-unreadable`. The path is never logged or returned.
 */
export async function sampleReferenceFrames(settings: StageSettings, request: { videoPath: string; signal: AbortSignal }): Promise<FrameSample> {
  const probed = await probeDurationMs(settings, request);
  if (probed.status !== 'probed') return probed;
  const { durationMs } = probed;
  const count = referenceAnalysisBounds.frames;
  return withScratchDir(settings, async (directory): Promise<FrameSample> => {
    const frames: Uint8Array[] = [];
    for (let index = 0; index < count; index += 1) {
      const atMs = Math.floor((durationMs * (index + 0.5)) / count);
      const extracted = await extractFrame(settings, { ...request, atMs, outputPath: join(directory, `frame-${String(index + 1).padStart(2, '0')}.jpg`) });
      if (extracted.status === 'frame') frames.push(extracted.frame);
      else if (extracted.status !== 'dropped') return extracted;
    }
    if (frames.length === 0) return { status: 'failed', code: 'media-unreadable' };
    return { status: 'sampled', frames, durationMs, bytes: frames.reduce((total, frame) => total + frame.byteLength, 0) };
  });
}

async function probeDurationMs(settings: StageSettings, request: { videoPath: string; signal: AbortSignal }): Promise<{ status: 'probed'; durationMs: number } | CommandFailure> {
  const outcome = await spawnBounded({
    command: settings.ffprobePath,
    args: ['-v', 'error', ...fileInputArgs(request.videoPath), '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1'],
    env: minimalChildEnv(settings),
    signal: commandSignal(request.signal, FRAME_COMMAND_TIMEOUT_MS),
    stdin: null,
    maxStdoutBytes: MAX_PROBE_STDOUT_BYTES,
  });
  if (outcome.status !== 'exited') return commandFailure(outcome, request.signal);
  if (outcome.exitCode !== 0) return { status: 'failed', code: 'media-unreadable' };
  const seconds = Number.parseFloat(outcome.stdout.trim());
  const durationMs = Math.floor(seconds * 1000);
  return Number.isFinite(durationMs) && durationMs > 0 ? { status: 'probed', durationMs } : { status: 'failed', code: 'media-unreadable' };
}

type ExtractedFrame = { status: 'frame'; frame: Uint8Array } | { status: 'dropped' } | CommandFailure;

async function extractFrame(settings: StageSettings, request: { videoPath: string; signal: AbortSignal; atMs: number; outputPath: string }): Promise<ExtractedFrame> {
  // Seconds with millisecond precision from an integer the sampler computed: never request text.
  const seekSeconds = (request.atMs / 1000).toFixed(3);
  const outcome = await spawnBounded({
    command: settings.ffmpegPath,
    args: [
      '-hide_banner',
      '-nostdin',
      '-v',
      'error',
      '-n',
      '-ss',
      seekSeconds,
      ...fileInputArgs(request.videoPath),
      '-frames:v',
      '1',
      '-an',
      '-vf',
      `scale='min(${referenceAnalysisBounds.frameMaxWidthPx},iw)':-2`,
      '-c:v',
      'mjpeg',
      '-q:v',
      JPEG_QUALITY,
      '-f',
      'image2',
      request.outputPath,
    ],
    env: minimalChildEnv(settings),
    signal: commandSignal(request.signal, FRAME_COMMAND_TIMEOUT_MS),
    stdin: null,
    maxStdoutBytes: MAX_PROBE_STDOUT_BYTES,
  });
  if (outcome.status !== 'exited') return commandFailure(outcome, request.signal);
  if (outcome.exitCode !== 0) return { status: 'dropped' };
  let frame: Uint8Array;
  try {
    frame = await readFile(request.outputPath);
  } catch {
    // ffmpeg exited 0 without writing a frame (a seek past the last keyframe): nothing to send.
    return { status: 'dropped' };
  }
  if (frame.byteLength === 0 || frame.byteLength > referenceAnalysisBounds.frameMaxBytes) return { status: 'dropped' };
  return JPEG_MAGIC.every((byte, index) => frame[index] === byte) ? { status: 'frame', frame } : { status: 'dropped' };
}

/** A tool that cannot start is missing; a fired job signal is the step's; a command's own timeout is `timed-out`. */
function commandFailure(outcome: Exclude<BoundedSpawnOutcome, { status: 'exited' }>, jobSignal: AbortSignal): CommandFailure {
  switch (outcome.status) {
    case 'spawn-failed':
      return { status: 'failed', code: 'tool-missing' };
    case 'aborted':
      return jobSignal.aborted ? { status: 'aborted' } : { status: 'failed', code: 'timed-out' };
    case 'output-too-large':
      return { status: 'failed', code: 'media-unreadable' };
  }
}
