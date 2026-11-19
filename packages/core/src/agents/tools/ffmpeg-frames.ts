import { execFile } from 'node:child_process';

/** Resolved through the child's PATH; no shell is ever involved. */
const FFMPEG_COMMAND = 'ffmpeg';
const FFPROBE_COMMAND = 'ffprobe';
/** Apple Silicon Homebrew first (SPEC 0002 A18), then the system folders. */
const FALLBACK_PATH = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin';
/** A 768 px JPEG is far below this; a larger stdout means something else came out. */
const MAX_FRAME_BYTES = 4 * 1024 * 1024;
const MAX_PROBE_BYTES = 64 * 1024;
const STDERR_TAIL_CHARS = 1000;
const JPEG_MAGIC = [0xff, 0xd8];

/**
 * Explicit minimal child environment (SPEC 0002 rev 3): PATH only, never the inherited
 * `process.env` that holds provider keys.
 */
export function minimalChildEnv(): NodeJS.ProcessEnv {
  return { PATH: process.env['PATH'] ?? FALLBACK_PATH };
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

function runProcess(command: string, args: readonly string[], signals: ProcessSignals, maxBytes: number): Promise<ProcessOutcome> {
  return new Promise((resolve) => {
    execFile(
      command,
      [...args],
      {
        env: minimalChildEnv(),
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

/** Input options shared by both tools: local files only, so a crafted media file cannot make ffmpeg reach the network. */
function localInput(sourcePath: string): string[] {
  return ['-protocol_whitelist', 'file', '-i', `file:${sourcePath}`];
}

export type DurationOutcome = { readonly status: 'ok'; readonly durationMs: number } | Exclude<ProcessOutcome, { status: 'ok' }>;

/** ffprobe duration of the source, read on every call (topology 3.3 "facts"). */
export async function probeDurationMs(sourcePath: string, signals: ProcessSignals): Promise<DurationOutcome> {
  const outcome = await runProcess(
    FFPROBE_COMMAND,
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', ...localInput(sourcePath)],
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
  const outcome = await runProcess(
    FFMPEG_COMMAND,
    [
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      seekArgument(request.timestampMs),
      ...localInput(request.sourcePath),
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
