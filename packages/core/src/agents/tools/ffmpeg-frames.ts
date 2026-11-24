import { execFile } from 'node:child_process';
import { extname } from 'node:path';
import {
  DEVELOPMENT_RUNTIME,
  RUNTIME_DIR_ENV_VAR,
  locateMediaTool,
  nodeRuntimeFileSystem,
  resolveStudioRuntime,
  runtimeSearchPath,
  type MediaToolName,
  type StudioRuntime,
} from '../../runtime';

/** Development only: Apple Silicon Homebrew first (SPEC 0002 A18), then the system folders. */
const FALLBACK_PATH = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin';
/** A 768 px JPEG is far below this; a larger stdout means something else came out. */
const MAX_FRAME_BYTES = 4 * 1024 * 1024;
const MAX_PROBE_BYTES = 64 * 1024;
const STDERR_TAIL_CHARS = 1000;
const JPEG_MAGIC = [0xff, 0xd8];

/**
 * Explicit minimal child environment (SPEC 0002 rev 3): PATH only, never the inherited
 * `process.env` that holds provider keys. Packaged mode (DI-AC-03) gives the child the bundled
 * `bin/` folders only, never the inherited PATH or the Homebrew fallback; development is unchanged.
 */
export function minimalChildEnv(runtime: StudioRuntime = DEVELOPMENT_RUNTIME): NodeJS.ProcessEnv {
  if (runtime.mode === 'packaged') return { PATH: runtimeSearchPath(runtime, '') };
  return { PATH: process.env['PATH'] ?? FALLBACK_PATH };
}

/**
 * Plan C3 rev 2: read per call from the environment the shell sets, so this module keeps no state
 * and its callers' signatures stay unchanged. A set but invalid folder throws
 * `InvalidRuntimeDirectoryError`, never a silent fall back to PATH.
 */
function processStudioRuntime(): StudioRuntime {
  return resolveStudioRuntime({ override: process.env[RUNTIME_DIR_ENV_VAR], fileSystem: nodeRuntimeFileSystem });
}

/**
 * The program to start: the bundled binary by absolute path when packaged; the bare name, resolved
 * through the child's PATH as before, in development. No shell is ever involved.
 */
function mediaCommand(runtime: StudioRuntime, tool: MediaToolName): string {
  const location = locateMediaTool(runtime, tool);
  return location.source === 'bundled' ? location.path : location.name;
}

export type ProcessFailureReason = 'not-installed' | 'timed-out' | 'exited' | 'bad-output';

export type ProcessOutcome =
  | { readonly status: 'ok'; readonly stdout: Buffer }
  | { readonly status: 'failed'; readonly reason: ProcessFailureReason; readonly stderrTail: string }
  | { readonly status: 'aborted' };

export interface ProcessSignals {
  /** The agent call's own signal: stop, call timeout, budget. */
  readonly caller: AbortSignal;
  /** The tool's 20 s ffmpeg deadline (topology 3.2). */
  readonly deadline: AbortSignal;
}

export class NonNumericSeekError extends Error {
  constructor() {
    super('Seek position must be a non-negative integer number of milliseconds');
    this.name = 'NonNumericSeekError';
  }
}

const SECONDS_PATTERN = /^[0-9]+\.[0-9]{3}$/;

/** Topology 3.2 "numeric `-ss` only": built from a validated integer and checked again. */
export function seekArgument(timestampMs: number): string {
  if (!Number.isSafeInteger(timestampMs) || timestampMs < 0) throw new NonNumericSeekError();
  const seconds = (timestampMs / 1000).toFixed(3);
  if (!SECONDS_PATTERN.test(seconds)) throw new NonNumericSeekError();
  return seconds;
}

function errorCode(error: unknown): unknown {
  return error instanceof Error && 'code' in error ? error.code : undefined;
}

function runProcess(tool: MediaToolName, args: readonly string[], signals: ProcessSignals, maxBytes: number): Promise<ProcessOutcome> {
  const runtime = processStudioRuntime();
  return new Promise((resolve) => {
    execFile(
      mediaCommand(runtime, tool),
      [...args],
      {
        env: minimalChildEnv(runtime),
        signal: AbortSignal.any([signals.caller, signals.deadline]),
        maxBuffer: maxBytes,
        encoding: 'buffer',
        windowsHide: true,
        shell: false,
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ status: 'ok', stdout });
          return;
        }
        if (signals.caller.aborted) {
          resolve({ status: 'aborted' });
          return;
        }
        const stderrTail = stderr.toString('utf8').slice(-STDERR_TAIL_CHARS);
        if (errorCode(error) === 'ENOENT') resolve({ status: 'failed', reason: 'not-installed', stderrTail: '' });
        else if (signals.deadline.aborted) resolve({ status: 'failed', reason: 'timed-out', stderrTail });
        else resolve({ status: 'failed', reason: 'exited', stderrTail });
      },
    );
  });
}

/**
 * The one demuxer each sampled container may open: renders are `.mp4`, live captures `.webm` and
 * mock captures `.mp4`. Pinning it stops ffmpeg from probing the content, so a file that is
 * really an HLS playlist, a concat list or an image sequence cannot pull in other local files.
 */
const DEMUXER_BY_EXTENSION: ReadonlyMap<string, string> = new Map([
  ['.mp4', 'mov,mp4,m4a,3gp,3g2,mj2'],
  ['.mov', 'mov,mp4,m4a,3gp,3g2,mj2'],
  ['.webm', 'matroska,webm'],
]);

/** The pinned demuxer for a source path, or null when its extension is not a sampled container. */
export function demuxerFor(sourcePath: string): string | null {
  return DEMUXER_BY_EXTENSION.get(extname(sourcePath).toLowerCase()) ?? null;
}

/**
 * Input options shared by both tools: local files only (a crafted media file cannot make ffmpeg
 * reach the network) and a pinned demuxer (no format probing). Null when the source has no
 * pinned demuxer; callers refuse it before any process starts.
 */
export function localInputArguments(sourcePath: string): string[] | null {
  const demuxer = demuxerFor(sourcePath);
  if (demuxer === null) return null;
  return ['-protocol_whitelist', 'file', '-f', demuxer, '-i', `file:${sourcePath}`];
}

const UNSUPPORTED_CONTAINER: Exclude<ProcessOutcome, { status: 'ok' }> = { status: 'failed', reason: 'bad-output', stderrTail: '' };

export type DurationOutcome = { readonly status: 'ok'; readonly durationMs: number } | Exclude<ProcessOutcome, { status: 'ok' }>;

/** ffprobe duration of the source, read on every call (topology 3.3 "facts"). */
export async function probeDurationMs(sourcePath: string, signals: ProcessSignals): Promise<DurationOutcome> {
  const input = localInputArguments(sourcePath);
  if (input === null) return UNSUPPORTED_CONTAINER;
  const outcome = await runProcess(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', ...input],
    signals,
    MAX_PROBE_BYTES,
  );
  if (outcome.status !== 'ok') return outcome;
  const seconds = Number.parseFloat(outcome.stdout.toString('utf8').trim());
  if (!Number.isFinite(seconds) || seconds <= 0) return { status: 'failed', reason: 'bad-output', stderrTail: '' };
  return { status: 'ok', durationMs: Math.floor(seconds * 1000) };
}

/**
 * One JPEG frame at `timestampMs`, scaled to fit a `maxEdgePx` square with its aspect ratio
 * kept, piped to memory: no file is written (topology 3.2 `_handoff_result: none`).
 */
export async function extractJpegFrame(
  request: { readonly sourcePath: string; readonly timestampMs: number; readonly maxEdgePx: number },
  signals: ProcessSignals,
): Promise<ProcessOutcome> {
  const edge = String(request.maxEdgePx);
  const input = localInputArguments(request.sourcePath);
  if (input === null) return UNSUPPORTED_CONTAINER;
  const outcome = await runProcess(
    'ffmpeg',
    [
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      seekArgument(request.timestampMs),
      ...input,
      '-frames:v',
      '1',
      '-vf',
      `scale=${edge}:${edge}:force_original_aspect_ratio=decrease`,
      '-f',
      'image2pipe',
      '-c:v',
      'mjpeg',
      '-q:v',
      '5',
      'pipe:1',
    ],
    signals,
    MAX_FRAME_BYTES,
  );
  if (outcome.status !== 'ok') return outcome;
  const isJpeg = outcome.stdout.length > JPEG_MAGIC.length && JPEG_MAGIC.every((byte, index) => outcome.stdout[index] === byte);
  return isJpeg ? outcome : { status: 'failed', reason: 'bad-output', stderrTail: '' };
}
