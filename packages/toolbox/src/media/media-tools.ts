/** Where ffmpeg and ffprobe live; `ToolboxEnv` satisfies this shape. */
export interface MediaToolPaths {
  ffmpegPath: string;
  ffprobePath: string;
}

/**
 * Shared prefix for every ffmpeg call that writes a file. `-n` refuses to overwrite: outputs are
 * checked before the call, and `-n` closes the gap between that check and the write.
 */
export const FFMPEG_WRITE_ARGS: readonly string[] = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n'];

/** Same encoder settings as video_tool.py `encode` and captions.py `burn`. */
export const H264_VIDEO_ARGS: readonly string[] = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p'];

export const ENCODE_TIMEOUT_MS = 20 * 60_000;
export const ANALYSIS_TIMEOUT_MS = 10 * 60_000;

/** Fixed-precision number for a filter expression; callers validate the range first. */
export function formatSeconds(value: number): string {
  return value.toFixed(3);
}
