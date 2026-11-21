/**
 * Demuxers a runner input file may be opened with: mp4/mov, webm/mkv, mp3, wav, aac, flac, ogg and
 * aiff (catalog media, narration clips, HyperFrames pictures). ffmpeg matches each comma-separated
 * part of a demuxer name, so "mp4" admits "mov,mp4,m4a,3gp,3g2,mj2".
 */
const INPUT_DEMUXERS: readonly string[] = ['mov', 'mp4', 'matroska', 'webm', 'mp3', 'wav', 'aac', 'flac', 'ogg', 'aiff'];

/**
 * Input options for every file the runner's own ffmpeg/ffprobe calls open, the same guard as
 * `@ace/toolbox` `FILE_INPUT_GUARD_ARGS`: only the local `file` protocol and only the demuxers
 * above, so a playlist or concat script disguised as media cannot reach other files or the network.
 * Generated `lavfi` sources open no file and take no guard.
 */
export const FILE_INPUT_GUARD_ARGS: readonly string[] = ['-protocol_whitelist', 'file', '-format_whitelist', INPUT_DEMUXERS.join(',')];

/** One guarded ffmpeg input: the guard options, then `-i <path>`. */
export function fileInputArgs(path: string): string[] {
  return [...FILE_INPUT_GUARD_ARGS, '-i', path];
}
