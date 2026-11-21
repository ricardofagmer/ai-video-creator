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

/**
 * Demuxers an input file may be opened with: the containers and audio formats the catalog accepts
 * (mp4/mov, webm/mkv, mp3, wav, aac, flac, ogg), macOS `say` AIFF drafts and the PNG/JPEG caption
 * images. ffmpeg matches each comma-separated part of a demuxer name, so "mp4" admits
 * "mov,mp4,m4a,3gp,3g2,mj2" and "webm" admits "matroska,webm".
 */
const INPUT_DEMUXERS: readonly string[] = ['mov', 'mp4', 'matroska', 'webm', 'mp3', 'wav', 'aac', 'flac', 'ogg', 'aiff', 'png_pipe', 'jpeg_pipe', 'image2'];

/**
 * Input options for every file ffmpeg or ffprobe opens: only the local `file` protocol (no http,
 * concat, subfile, data or pipe) and only the demuxers above, so a playlist or concat script
 * disguised as media cannot make the tool read other files or reach the network.
 */
export const FILE_INPUT_GUARD_ARGS: readonly string[] = ['-protocol_whitelist', 'file', '-format_whitelist', INPUT_DEMUXERS.join(',')];

/** One guarded ffmpeg input: the guard options, then `-i <path>`. */
export function fileInputArgs(path: string): string[] {
  return [...FILE_INPUT_GUARD_ARGS, '-i', path];
}

export const ENCODE_TIMEOUT_MS = 20 * 60_000;
export const ANALYSIS_TIMEOUT_MS = 10 * 60_000;

/** Fixed-precision number for a filter expression; callers validate the range first. */
export function formatSeconds(value: number): string {
  return value.toFixed(3);
}
