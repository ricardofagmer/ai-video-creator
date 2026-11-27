import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ExternalToolError } from '@ace/toolbox/dist/errors';
import { runTool } from '@ace/toolbox/dist/media/exec-tool';
import { probeMedia } from '@ace/toolbox/dist/media/ffprobe';
import { ANALYSIS_TIMEOUT_MS, ENCODE_TIMEOUT_MS, FFMPEG_WRITE_ARGS, H264_VIDEO_ARGS } from '@ace/toolbox/dist/media/media-tools';
import {
  HyperframesSandboxUnavailableError,
  checkPicture,
  completeRenderRuntime,
  renderPicture,
  type HyperframesProcessPort,
  type HyperframesRuntime,
  type RunProbe,
} from '@studio/hyperframes';
import { type HyperframesRenderRequest } from '../tool-runner.protocol';
import { fileInputArgs } from './ffmpeg-input';

/*
 * The tool-runner side of a HyperFrames render (SPEC 0008 section 5.2): `variables.json`, one
 * sandboxed `renderPicture`, an ffprobe check of the picture, then the narration mux cut to the
 * narration length. Failure messages name the check only; they never carry a path, a value or
 * stderr, and `tool-runner.main.ts` keeps them off the reply in any case (K12).
 */

const NARRATION_SAMPLE_RATE = '44100';
/** Used only if the runner's minimal environment somehow lacks PATH. */
const FALLBACK_PATH = '/usr/bin:/bin';

export interface HyperframesRenderPorts {
  process: HyperframesProcessPort;
  /** Runs ffprobe by a fixed argv with no shell and answers its stdout. */
  runProbe: RunProbe;
  /** The real path of an existing file or folder; read-only on the disk. */
  realPath(path: string): Promise<string>;
}

export class PictureCheckError extends ExternalToolError {
  constructor(readonly checks: readonly string[]) {
    super(`hyperframes picture refused: ${checks.join(', ')}`, 'ffprobe');
    this.name = 'PictureCheckError';
  }
}

async function runFfprobe(program: string, args: readonly string[]): Promise<string> {
  const { stdout } = await runTool(program, [...args], ANALYSIS_TIMEOUT_MS);
  return stdout;
}

/** The child's own ports: the real sandboxed process adapter, ffprobe and the file system's real paths. */
export function realHyperframesRenderPorts(process: HyperframesProcessPort): HyperframesRenderPorts {
  return { process, runProbe: runFfprobe, realPath: (path) => realpath(path) };
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

/**
 * The parent's checked runtime completed with this runner's own node binary, the scratch folder and
 * PATH. SPEC 0008 section 4.5 (`PATH` = `StageSettings.path`) and section 17.5 ("the child still
 * adds `path`"): the parent spawns this runner with `minimalChildEnv`, whose PATH is
 * `StageSettings.path`, so this read is that setting.
 */
async function runtimeOf(request: HyperframesRenderRequest): Promise<HyperframesRuntime> {
  const completed = await completeRenderRuntime(request.runtime, {
    nodePath: process.execPath,
    tmpDir: request.scratchDir,
    path: process.env['PATH'] ?? FALLBACK_PATH,
  });
  // A path that cannot be resolved refuses before any start; the error carries no path (K12).
  if (completed.status === 'refused') throw new HyperframesSandboxUnavailableError();
  return completed.runtime;
}

type Background = NonNullable<HyperframesRenderRequest['background']>;

/** Still images are opened by their own demuxers; the guard of `ffmpeg-input.ts` admits media containers only. */
const IMAGE_INPUT_GUARD_ARGS: readonly string[] = ['-protocol_whitelist', 'file', '-format_whitelist', 'image2,png_pipe,jpeg_pipe,webp_pipe'];
const BLANK_COLOR = '0x0b0b0f';
/**
 * A still drifts in by this much over its stretch, so an image scene is not a frozen frame. Kept
 * small because stills are often full app screens or pages, and a deeper zoom crops their edges.
 */
const STILL_ZOOM_END = 1.04;

function seconds(value: number): string {
  return value.toFixed(3);
}

/**
 * Writes the background clip into the staged template copy: every segment scaled to cover the
 * canvas and cut to its stretch, joined in order, the last frame held to `lengthS`. A capture used
 * by several scenes keeps playing from where the scene before it stopped, wrapping at its end.
 */
async function buildBackground(request: HyperframesRenderRequest, background: Background, templateDir: string, runtime: HyperframesRuntime): Promise<void> {
  const { width, height, fps } = request;
  const inputs: string[] = [];
  const chains: string[] = [];
  const playedS = new Map<string, number>();
  const cover = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
  for (const [index, segment] of background.segments.entries()) {
    const duration = seconds(segment.durationS);
    const label = `[v${index}]`;
    if (segment.kind === 'blank' || segment.source === null) {
      inputs.push('-f', 'lavfi', '-t', duration, '-i', `color=c=${BLANK_COLOR}:s=${width}x${height}:r=${fps}`);
      chains.push(`[${index}:v]setsar=1,format=yuv420p${label}`);
      continue;
    }
    if (segment.kind === 'image') {
      inputs.push('-loop', '1', '-framerate', String(fps), '-t', duration, ...IMAGE_INPUT_GUARD_ARGS, '-i', segment.source);
      const frames = Math.max(1, Math.round(segment.durationS * fps));
      const zoom = `zoompan=z='1+${(STILL_ZOOM_END - 1).toFixed(2)}*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=${fps}`;
      chains.push(`[${index}:v]scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase,crop=${width * 2}:${height * 2},${zoom},setsar=1,format=yuv420p${label}`);
      continue;
    }
    const sourceS = (await probeMedia(runtime.ffprobeBin, segment.source)).durationS;
    const offset = sourceS > 0 ? (playedS.get(segment.source) ?? 0) % sourceS : 0;
    playedS.set(segment.source, offset + segment.durationS);
    inputs.push('-stream_loop', '-1', '-ss', seconds(offset), '-t', duration, ...fileInputArgs(segment.source));
    chains.push(`[${index}:v]${cover},fps=${fps},setsar=1,format=yuv420p${label}`);
  }
  const playedTotal = background.segments.reduce((sum, segment) => sum + segment.durationS, 0);
  const hold = Math.max(0, background.lengthS - playedTotal);
  const joined = `${background.segments.map((_segment, index) => `[v${index}]`).join('')}concat=n=${background.segments.length}:v=1:a=0,tpad=stop_mode=clone:stop_duration=${seconds(hold)}[out]`;
  const output = join(templateDir, background.file);
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  await runTool(
    runtime.ffmpegBin,
    [...FFMPEG_WRITE_ARGS, ...inputs, '-filter_complex', [...chains, joined].join(';'), '-map', '[out]', '-an', ...H264_VIDEO_ARGS, '-r', String(fps), '-g', String(fps), '-t', seconds(background.lengthS), output],
    ENCODE_TIMEOUT_MS,
  );
}

export async function hyperframesRender(request: HyperframesRenderRequest, ports: HyperframesRenderPorts): Promise<{ durationS: number; renderSeconds: number }> {
  const variablesFile = join(request.scratchDir, 'variables.json');
  await writeFile(variablesFile, `${JSON.stringify(request.variables)}\n`, { flag: 'wx', mode: 0o600 });
  const picture = join(request.scratchDir, 'picture.mp4');
  const [runtime, templateDir] = await Promise.all([runtimeOf(request), realSandboxPath(ports, request.templateDir)]);
  if (request.background !== undefined) await buildBackground(request, request.background, templateDir, runtime);
  const { renderSeconds } = await renderPicture({ templateDir, variablesFile, output: picture, runtime }, { process: ports.process });

  // The media programs are the resolved runtime paths, not the unresolved settings (SPEC 0008 sections 18.1 G3 and 18.5).
  const check = await checkPicture({ ffprobeBin: runtime.ffprobeBin, file: picture, expected: request }, ports.runProbe);
  if (check.mismatches.length > 0) throw new PictureCheckError(check.mismatches);

  const duration = request.durationS.toFixed(3);
  await runTool(
    runtime.ffmpegBin,
    [
      ...FFMPEG_WRITE_ARGS,
      ...fileInputArgs(picture),
      ...fileInputArgs(request.audio),
      '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '192k', '-ar', NARRATION_SAMPLE_RATE,
      '-t', duration,
      '-movflags', '+faststart',
      request.output,
    ],
    ENCODE_TIMEOUT_MS,
  );
  const written = await probeMedia(runtime.ffprobeBin, request.output);
  return { durationS: written.durationS, renderSeconds };
}
