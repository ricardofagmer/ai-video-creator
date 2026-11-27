import { hyperframesBounds } from '@studio/shared/hyperframes';

/*
 * The ffprobe check of a HyperFrames picture (SPEC 0008 section 5.2 step 4): codec `h264`, pixel
 * format `yuv420p`, the expected size and frame rate, and at least the expected length minus the
 * frame tolerance. A render and the trace use this one check, so both judge a picture alike.
 */

export interface PictureProbe {
  codec: string;
  pixelFormat: string;
  width: number;
  height: number;
  fps: number;
  durationS: number;
}

export interface PictureExpectation {
  width: number;
  height: number;
  fps: number;
  durationS: number;
}

export type PictureCheckId = 'unreadable' | 'codec' | 'pixel-format' | 'size' | 'fps' | 'duration';

export interface PictureCheck {
  /** Null when ffprobe's output could not be read; `mismatches` is then `['unreadable']`. */
  probe: PictureProbe | null;
  /** Empty when the picture is what was expected. */
  mismatches: readonly PictureCheckId[];
}

/** Runs one program by a fixed argv with no shell and answers its stdout. */
export type RunProbe = (program: string, args: readonly string[]) => Promise<string>;

const FPS_TOLERANCE = 0.01;

/**
 * The picture is a file a template produced, so ffprobe opens it under the same guard as every
 * other media input (`@ace/toolbox` `FILE_INPUT_GUARD_ARGS`): only the local `file` protocol and
 * only these demuxers, so a playlist or concat script disguised as media cannot reach other files
 * or the network.
 */
const INPUT_DEMUXERS: readonly string[] = ['mov', 'mp4', 'matroska', 'webm', 'mp3', 'wav', 'aac', 'flac', 'ogg', 'aiff'];
const FILE_INPUT_GUARD_ARGS: readonly string[] = ['-protocol_whitelist', 'file', '-format_whitelist', INPUT_DEMUXERS.join(',')];

function pictureProbeArgs(file: string): readonly string[] {
  return [
    '-v',
    'error',
    ...FILE_INPUT_GUARD_ARGS,
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=codec_name,pix_fmt,width,height,avg_frame_rate:format=duration',
    '-of',
    'json',
    file,
  ];
}

function field(source: unknown, key: string): unknown {
  return typeof source === 'object' && source !== null ? Reflect.get(source, key) : undefined;
}

function frameRate(text: unknown): number | null {
  if (typeof text !== 'string') return null;
  const [numerator, denominator] = text.split('/').map((part) => Number.parseFloat(part));
  if (numerator === undefined || denominator === undefined || !Number.isFinite(numerator) || !(denominator > 0)) return null;
  return numerator / denominator;
}

/** The first video stream of ffprobe's JSON, or null when any field is missing. */
function parsePictureProbe(json: string): PictureProbe | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    // Unparseable ffprobe output means the picture cannot be checked; the caller refuses it.
    return null;
  }
  const streams = field(parsed, 'streams');
  const stream: unknown = Array.isArray(streams) ? streams[0] : undefined;
  const codec = field(stream, 'codec_name');
  const pixelFormat = field(stream, 'pix_fmt');
  const width = field(stream, 'width');
  const height = field(stream, 'height');
  const fps = frameRate(field(stream, 'avg_frame_rate'));
  const durationText = field(field(parsed, 'format'), 'duration');
  const durationS = typeof durationText === 'string' ? Number.parseFloat(durationText) : Number.NaN;
  if (typeof codec !== 'string' || typeof pixelFormat !== 'string' || typeof width !== 'number' || typeof height !== 'number') return null;
  if (fps === null || !Number.isFinite(durationS)) return null;
  return { codec, pixelFormat, width, height, fps, durationS };
}

function pictureMismatches(probe: PictureProbe, expected: PictureExpectation): PictureCheckId[] {
  const mismatches: PictureCheckId[] = [];
  if (probe.codec !== 'h264') mismatches.push('codec');
  if (probe.pixelFormat !== 'yuv420p') mismatches.push('pixel-format');
  if (probe.width !== expected.width || probe.height !== expected.height) mismatches.push('size');
  if (Math.abs(probe.fps - expected.fps) > FPS_TOLERANCE) mismatches.push('fps');
  if (probe.durationS < expected.durationS - hyperframesBounds.pictureFrameTolerance / expected.fps) mismatches.push('duration');
  return mismatches;
}

export interface PictureCheckRequest {
  /** The resolved `ffprobeBin` of the render runtime, never an unresolved setting (section 18.5). */
  ffprobeBin: string;
  file: string;
  expected: PictureExpectation;
}

/**
 * Probes the picture with ffprobe and compares it with what was expected. A failure of `run`
 * itself (the program did not start, timed out or exited non-zero) is the caller's to map and
 * passes through.
 */
export async function checkPicture(request: PictureCheckRequest, run: RunProbe): Promise<PictureCheck> {
  const probe = parsePictureProbe(await run(request.ffprobeBin, pictureProbeArgs(request.file)));
  if (probe === null) return { probe, mismatches: ['unreadable'] };
  return { probe, mismatches: pictureMismatches(probe, request.expected) };
}
