import { realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ExternalToolError } from '@ace/toolbox/dist/errors';
import { runTool } from '@ace/toolbox/dist/media/exec-tool';
import { probeMedia } from '@ace/toolbox/dist/media/ffprobe';
import { ANALYSIS_TIMEOUT_MS, ENCODE_TIMEOUT_MS, FFMPEG_WRITE_ARGS } from '@ace/toolbox/dist/media/media-tools';
import { HyperframesSandboxUnavailableError, renderPicture, type HyperframesProcessPort, type HyperframesRuntime } from '@studio/hyperframes';
import { hyperframesBounds } from '@studio/shared/hyperframes';
import { type HyperframesRenderRequest } from '../tool-runner.protocol';

/*
 * The tool-runner side of a HyperFrames render (SPEC 0008 section 5.2): `variables.json`, one
 * sandboxed `renderPicture`, an ffprobe check of the picture, then the narration mux cut to the
 * narration length. Failure messages name the check only; they never carry a path, a value or
 * stderr, and `tool-runner.main.ts` keeps them off the reply in any case (K12).
 */

const NARRATION_SAMPLE_RATE = '44100';
const FPS_TOLERANCE = 0.01;
/** Used only if the runner's minimal environment somehow lacks PATH. */
const FALLBACK_PATH = '/usr/bin:/bin';

export interface PictureProbe {
  codec: string;
  pixelFormat: string;
  width: number;
  height: number;
  fps: number;
  durationS: number;
}

export interface HyperframesRenderPorts {
  process: HyperframesProcessPort;
  probePicture(ffprobePath: string, file: string): Promise<PictureProbe | null>;
  /** The real path of an existing file or folder; read-only on the disk. */
  realPath(path: string): Promise<string>;
}

export class PictureCheckError extends ExternalToolError {
  constructor(readonly checks: readonly string[]) {
    super(`hyperframes picture refused: ${checks.join(', ')}`, 'ffprobe');
    this.name = 'PictureCheckError';
  }
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

/** Check ids, empty when the picture is what the request asked for (section 5.2 step 4). */
export function pictureMismatches(probe: PictureProbe, request: Pick<HyperframesRenderRequest, 'width' | 'height' | 'fps' | 'durationS'>): string[] {
  const mismatches: string[] = [];
  if (probe.codec !== 'h264') mismatches.push('codec');
  if (probe.pixelFormat !== 'yuv420p') mismatches.push('pixel-format');
  if (probe.width !== request.width || probe.height !== request.height) mismatches.push('size');
  if (Math.abs(probe.fps - request.fps) > FPS_TOLERANCE) mismatches.push('fps');
  if (probe.durationS < request.durationS - hyperframesBounds.pictureFrameTolerance / request.fps) mismatches.push('duration');
  return mismatches;
}

async function probeWithFfprobe(ffprobePath: string, file: string): Promise<PictureProbe | null> {
  const { stdout } = await runTool(
    ffprobePath,
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,pix_fmt,width,height,avg_frame_rate:format=duration', '-of', 'json', file],
    ANALYSIS_TIMEOUT_MS,
  );
  return parsePictureProbe(stdout);
}

/** The child's own ports: the real sandboxed process adapter, ffprobe and the file system's real paths. */
export function realHyperframesRenderPorts(process: HyperframesProcessPort): HyperframesRenderPorts {
  return { process, probePicture: probeWithFfprobe, realPath: (path) => realpath(path) };
}

/**
 * A sandbox parameter as a real path (SPEC 0008 section 17.5, K16, U14): the profile matches the
 * resolved path, so `/var/folders/…` must reach it as `/private/var/folders/…`. A path that cannot
 * be resolved refuses before any start; the error carries no path (K12).
 */
async function realSandboxPath(ports: HyperframesRenderPorts, path: string): Promise<string> {
  try {
    return await ports.realPath(path);
  } catch {
    // Any resolution failure means the isolation cannot be configured; the cause holds a path.
    throw new HyperframesSandboxUnavailableError();
  }
}

/** The parent's runtime plus the child's own `nodePath`, `tmpDir` and `path`, the two paths real. */
async function runtimeOf(request: HyperframesRenderRequest, ports: HyperframesRenderPorts): Promise<HyperframesRuntime> {
  const [nodePath, tmpDir] = await Promise.all([
    // The runner's own node binary, by absolute path: never resolved through PATH.
    realSandboxPath(ports, process.execPath),
    realSandboxPath(ports, request.scratchDir),
  ]);
  // SPEC 0008 section 4.5 (`PATH` = `StageSettings.path`) and section 17.5 ("the child still adds
  // `path`"): the parent spawns this runner with `minimalChildEnv`, whose PATH is
  // `StageSettings.path`, so this read is that setting. It is an environment value, never a `-D`
  // sandbox parameter (AC 88).
  return { ...request.runtime, nodePath, tmpDir, path: process.env['PATH'] ?? FALLBACK_PATH };
}

export async function hyperframesRender(request: HyperframesRenderRequest, ports: HyperframesRenderPorts): Promise<{ durationS: number; renderSeconds: number }> {
  const variablesFile = join(request.scratchDir, 'variables.json');
  await writeFile(variablesFile, `${JSON.stringify(request.variables)}\n`, { flag: 'wx', mode: 0o600 });
  const picture = join(request.scratchDir, 'picture.mp4');
  const [runtime, templateDir] = await Promise.all([runtimeOf(request, ports), realSandboxPath(ports, request.templateDir)]);
  const { renderSeconds } = await renderPicture({ templateDir, variablesFile, output: picture, runtime }, { process: ports.process });

  const probe = await ports.probePicture(request.tools.ffprobePath, picture);
  if (probe === null) throw new PictureCheckError(['unreadable']);
  const mismatches = pictureMismatches(probe, request);
  if (mismatches.length > 0) throw new PictureCheckError(mismatches);

  const duration = request.durationS.toFixed(3);
  // The same resolved ffmpeg the sandbox allows, not the unresolved setting (SPEC 0008 section 18.1 G3).
  await runTool(
    runtime.ffmpegBin,
    [
      ...FFMPEG_WRITE_ARGS,
      '-i', picture,
      '-i', request.audio,
      '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '192k', '-ar', NARRATION_SAMPLE_RATE,
      '-t', duration,
      '-movflags', '+faststart',
      request.output,
    ],
    ENCODE_TIMEOUT_MS,
  );
  const written = await probeMedia(request.tools.ffprobePath, request.output);
  return { durationS: written.durationS, renderSeconds };
}
