import { z } from 'zod';
import { InputError } from '../../errors';
import { runTool } from '../../media/exec-tool';
import { probeMedia } from '../../media/ffprobe';
import { filePathArg, numberArg, parseCommandArgs } from '../../media/media-args';
import { prepareOutputFile, resolveInputFile } from '../../media/media-paths';
import { ENCODE_TIMEOUT_MS, FFMPEG_WRITE_ARGS, fileInputArgs, formatSeconds, H264_VIDEO_ARGS, type MediaToolPaths } from '../../media/media-tools';

/** Contract C9 `fades` arguments. Defaults: video_tool.py `motion` (0.4 s), matching RELATORIO.md's 0.4 s fade-out. */
export const FadesArgsSchema = z
  .object({
    input: filePathArg,
    output: filePathArg,
    fadeInS: numberArg(z.number().min(0).max(30)).default(0.4),
    fadeOutS: numberArg(z.number().min(0).max(30)).default(0.4),
  })
  .strict();
export type FadesArgs = z.input<typeof FadesArgsSchema>;

export interface FadesResult {
  command: 'fades';
  output: string;
  durationS: number;
  /** Fades as applied: each is clamped to half the video duration. */
  fadeInS: number;
  fadeOutS: number;
}

/**
 * Picture fade from and to black (port of video_tool.py `motion`). The source fades only the
 * picture; audio is re-encoded unchanged, and the music bed carries its own audio fades.
 */
export async function runFades(tools: MediaToolPaths, rawArgs: unknown): Promise<FadesResult> {
  const args = parseCommandArgs(FadesArgsSchema, rawArgs, 'fades');
  const input = await resolveInputFile(args.input, 'input video');
  const output = await prepareOutputFile(args.output, [input]);
  const probe = await probeMedia(tools.ffprobePath, input);
  if (!probe.video) throw new InputError(`input has no video stream: ${input}`);
  if (probe.durationS <= 0) throw new InputError(`input has no measurable duration: ${input}`);

  const durationS = probe.durationS;
  const fadeInS = Math.min(args.fadeInS, durationS / 2);
  const fadeOutS = Math.min(args.fadeOutS, durationS / 2);
  const filters: string[] = [];
  if (fadeInS > 0) filters.push(`fade=t=in:st=0:d=${formatSeconds(fadeInS)}`);
  if (fadeOutS > 0) filters.push(`fade=t=out:st=${formatSeconds(durationS - fadeOutS)}:d=${formatSeconds(fadeOutS)}`);

  await runTool(
    tools.ffmpegPath,
    [
      ...FFMPEG_WRITE_ARGS,
      ...fileInputArgs(input),
      ...(filters.length > 0 ? ['-vf', filters.join(',')] : []),
      ...H264_VIDEO_ARGS,
      '-c:a', 'aac', '-b:a', '160k',
      '-movflags', '+faststart',
      output,
    ],
    ENCODE_TIMEOUT_MS,
  );
  return { command: 'fades', output, durationS, fadeInS, fadeOutS };
}
