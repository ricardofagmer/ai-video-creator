import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { referenceDownloadBounds } from '@studio/shared/asset-jobs';
import { videoPostUrl, type VideoPost } from '@studio/shared/catalog';
import { minimalChildEnv } from '../stages/process/child-env';
import { commandSignal, spawnBounded } from '../stages/process/spawn-bounded';
import { type StageSettings } from '../stages/shared/stage-settings';

export type ReferenceVideoDownloadFailure = 'tool-missing' | 'download-failed' | 'timed-out';

export type ReferenceVideoDownload =
  | { status: 'downloaded'; path: string; bytes: number }
  | { status: 'failed'; code: ReferenceVideoDownloadFailure }
  /** The job's own signal fired; the step names the ending. */
  | { status: 'aborted' };

/** The file is always written under this name, whatever the post is called. */
const OUTPUT_STEM = 'reference-video';
/** yt-dlp runs quiet; anything longer than this on stdout is not its answer. */
const MAX_STDOUT_BYTES = 64 * 1024;
const SOCKET_TIMEOUT_SECONDS = '20';

/**
 * Fetches the video of one supported post into `directory` for a reference analysis
 * (docs/specs/2026-11-24-link-reference-analysis-design.md). The caller owns the folder and removes
 * it: the video is sampled and deleted, never kept.
 *
 * - The address is rebuilt from the parsed post, never taken from stored text, and follows `--`.
 * - `--ignore-config` and the minimal child environment: no owner config, cookie or browser session
 *   reaches the tool, so only what is public can be fetched.
 * - One item, at most `maxHeightPx` tall, `maxFileBytes` large and `maxDurationSeconds` long, in one
 *   attempt, bounded by `timeoutMs` joined to the job signal. No shell parses the argv.
 * - yt-dlp exits 0 when a filter skips the video, so success is the file being there, not the exit
 *   code. A missing or oversized file is `download-failed`: blocked, private, removed or too large.
 *
 * Nothing is logged here and the address never leaves this function.
 */
export async function downloadReferenceVideo(
  settings: StageSettings,
  request: { post: VideoPost; directory: string; signal: AbortSignal },
): Promise<ReferenceVideoDownload> {
  const { maxHeightPx, maxFileBytes, maxDurationSeconds, timeoutMs } = referenceDownloadBounds;
  const outcome = await spawnBounded({
    command: settings.ytDlpPath,
    args: [
      '--ignore-config',
      '--no-playlist',
      '--playlist-items',
      '1',
      '--no-cache-dir',
      '--no-part',
      '--no-mtime',
      '--no-progress',
      '--quiet',
      '--no-warnings',
      '--abort-on-error',
      '--retries',
      '1',
      '--socket-timeout',
      SOCKET_TIMEOUT_SECONDS,
      '--max-filesize',
      String(maxFileBytes),
      // `<=?` also admits a post whose duration the platform does not report.
      '--match-filters',
      `duration <=? ${maxDurationSeconds}`,
      // Frames only: a video-only stream is enough, so nothing has to be merged.
      '--format',
      `bv*[height<=${maxHeightPx}]/b[height<=${maxHeightPx}]/b`,
      '--output',
      join(request.directory, `${OUTPUT_STEM}.%(ext)s`),
      '--',
      videoPostUrl(request.post),
    ],
    env: minimalChildEnv(settings),
    signal: commandSignal(request.signal, timeoutMs),
    stdin: null,
    maxStdoutBytes: MAX_STDOUT_BYTES,
  });
  switch (outcome.status) {
    case 'spawn-failed':
      return { status: 'failed', code: 'tool-missing' };
    case 'aborted':
      return request.signal.aborted ? { status: 'aborted' } : { status: 'failed', code: 'timed-out' };
    case 'output-too-large':
      return { status: 'failed', code: 'download-failed' };
    case 'exited':
      return downloadedFile(request.directory, maxFileBytes);
  }
}

async function downloadedFile(directory: string, maxFileBytes: number): Promise<ReferenceVideoDownload> {
  const names = await readdir(directory);
  const name = names.find((entry) => entry.startsWith(`${OUTPUT_STEM}.`));
  if (name === undefined) return { status: 'failed', code: 'download-failed' };
  const path = join(directory, name);
  const details = await stat(path);
  if (!details.isFile() || details.size === 0 || details.size > maxFileBytes) return { status: 'failed', code: 'download-failed' };
  return { status: 'downloaded', path, bytes: details.size };
}
