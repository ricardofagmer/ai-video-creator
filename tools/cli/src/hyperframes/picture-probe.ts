import { cliText } from '../i18n/messages.js';
import { type PictureProbe } from './hyperframes-ports.js';

/*
 * The ffprobe check of a HyperFrames picture (SPEC 0008 section 5.2 step 4): codec `h264`, pixel
 * format `yuv420p`, the template's size and frame rate, and at least the expected length minus one
 * frame. Used by `studio hyperframes trace` on its one render.
 */

/** `ffprobe` arguments; the file is the last one and is never interpreted by a shell. */
export function pictureProbeArgs(file: string): readonly string[] {
  return [
    '-v',
    'error',
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
export function parsePictureProbe(json: string): PictureProbe | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
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

export interface PictureExpectation {
  width: number;
  height: number;
  fps: number;
  durationS: number;
}

const FPS_TOLERANCE = 0.01;

/** Mismatches in the active language, empty when the picture is correct. */
export function pictureMismatches(probe: PictureProbe, expected: PictureExpectation): string[] {
  const text = cliText().hyperframes.picture;
  const mismatches: string[] = [];
  if (probe.codec !== 'h264') mismatches.push(text.codec(probe.codec));
  if (probe.pixelFormat !== 'yuv420p') mismatches.push(text.pixelFormat(probe.pixelFormat));
  if (probe.width !== expected.width || probe.height !== expected.height) {
    mismatches.push(text.size(`${probe.width}x${probe.height}`, `${expected.width}x${expected.height}`));
  }
  if (Math.abs(probe.fps - expected.fps) > FPS_TOLERANCE) mismatches.push(text.fps(probe.fps.toFixed(2), expected.fps));
  if (probe.durationS < expected.durationS - 1 / expected.fps) {
    mismatches.push(text.duration(probe.durationS.toFixed(2), expected.durationS));
  }
  return mismatches;
}
