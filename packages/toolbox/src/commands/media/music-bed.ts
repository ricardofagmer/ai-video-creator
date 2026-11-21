import { z } from 'zod';
import { InputError } from '../../errors';
import { runTool } from '../../media/exec-tool';
import { probeMedia } from '../../media/ffprobe';
import { filePathArg, numberArg, parseCommandArgs } from '../../media/media-args';
import { prepareOutputFile, resolveInputFile } from '../../media/media-paths';
import { ENCODE_TIMEOUT_MS, FFMPEG_WRITE_ARGS, fileInputArgs, formatSeconds, type MediaToolPaths } from '../../media/media-tools';

/** Contract C9 `music-bed` arguments. Defaults: video_tool.py `music` and RELATORIO.md (volume 0.25, -16 LUFS). */
export const MusicBedArgsSchema = z
  .object({
    input: filePathArg,
    output: filePathArg,
    music: filePathArg,
    volume: numberArg(z.number().gt(0).max(2)).default(0.25),
    fadeInS: numberArg(z.number().min(0).max(60)).default(1.0),
    fadeOutS: numberArg(z.number().min(0).max(60)).default(1.5),
    duck: z.boolean().default(true),
    loudnessTargetLufs: numberArg(z.number().min(-30).max(-8)).default(-16),
    truePeakTargetDb: numberArg(z.number().min(-9).max(-1)).default(-1.5),
  })
  .strict();
export type MusicBedArgs = z.input<typeof MusicBedArgsSchema>;

export interface MusicBedResult {
  command: 'music-bed';
  output: string;
  durationS: number;
  volume: number;
  /** Fades as applied: each is clamped to half the video duration. */
  fadeInS: number;
  fadeOutS: number;
  /** False when ducking was off or the video had no speech track to key it. */
  ducked: boolean;
  sourceHadAudio: boolean;
  loudnessTargetLufs: number;
  truePeakTargetDb: number;
}

const AUDIO_FORMAT = 'aresample=48000,aformat=channel_layouts=stereo';
const LOUDNESS_RANGE_LU = 11;

interface BedPlan {
  durationS: number;
  volume: number;
  fadeInS: number;
  fadeOutS: number;
  duck: boolean;
  hasSpeech: boolean;
  loudnorm: string;
}

/** Filter graph of video_tool.py `mix_music`; every number in it was range-checked by the schema. */
function buildFilterGraph(plan: BedPlan): string {
  let bed = `[1:a]${AUDIO_FORMAT},atrim=start=0:end=${formatSeconds(plan.durationS)},volume=${plan.volume.toFixed(3)}`;
  if (plan.fadeInS > 0) bed += `,afade=t=in:st=0:d=${formatSeconds(plan.fadeInS)}`;
  if (plan.fadeOutS > 0) bed += `,afade=t=out:st=${formatSeconds(plan.durationS - plan.fadeOutS)}:d=${formatSeconds(plan.fadeOutS)}`;
  if (!plan.hasSpeech) return `${bed},${plan.loudnorm}[a]`;
  const chain = plan.duck
    ? [
        `${bed}[bed]`,
        `[0:a]${AUDIO_FORMAT},asplit=2[speech][key]`,
        // The speech track keys the compressor, so the bed drops only while someone is talking.
        '[bed][key]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[ducked]',
        '[speech][ducked]amix=inputs=2:duration=first:normalize=0[mix]',
      ]
    : [`${bed}[bed]`, `[0:a]${AUDIO_FORMAT}[speech]`, '[speech][bed]amix=inputs=2:duration=first:normalize=0[mix]'];
  return [...chain, `[mix]${plan.loudnorm}[a]`].join(';');
}

/**
 * Loops a music bed under the whole video, lowers it while speech plays (sidechain ducking) and
 * normalises the mix to the loudness target. Video is stream-copied; audio is AAC 192k 48 kHz.
 */
export async function runMusicBed(tools: MediaToolPaths, rawArgs: unknown): Promise<MusicBedResult> {
  const args = parseCommandArgs(MusicBedArgsSchema, rawArgs, 'music-bed');
  const input = await resolveInputFile(args.input, 'input video');
  const music = await resolveInputFile(args.music, 'music file');
  const output = await prepareOutputFile(args.output, [input, music]);
  const probe = await probeMedia(tools.ffprobePath, input);
  if (!probe.video) throw new InputError(`input has no video stream: ${input}`);
  if (probe.durationS <= 0) throw new InputError(`input has no measurable duration: ${input}`);

  const durationS = probe.durationS;
  const hasSpeech = probe.audio !== null;
  const plan: BedPlan = {
    durationS,
    volume: args.volume,
    fadeInS: Math.min(args.fadeInS, durationS / 2),
    fadeOutS: Math.min(args.fadeOutS, durationS / 2),
    duck: args.duck,
    hasSpeech,
    loudnorm: `loudnorm=I=${args.loudnessTargetLufs.toFixed(2)}:TP=${args.truePeakTargetDb.toFixed(2)}:LRA=${LOUDNESS_RANGE_LU}`,
  };
  await runTool(
    tools.ffmpegPath,
    [
      ...FFMPEG_WRITE_ARGS,
      ...fileInputArgs(input),
      '-stream_loop', '-1', ...fileInputArgs(music),
      '-filter_complex', buildFilterGraph(plan),
      '-map', '0:v', '-map', '[a]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
      '-t', formatSeconds(durationS),
      '-movflags', '+faststart',
      output,
    ],
    ENCODE_TIMEOUT_MS,
  );
  return {
    command: 'music-bed',
    output,
    durationS,
    volume: args.volume,
    fadeInS: plan.fadeInS,
    fadeOutS: plan.fadeOutS,
    ducked: args.duck && hasSpeech,
    sourceHadAudio: hasSpeech,
    loudnessTargetLufs: args.loudnessTargetLufs,
    truePeakTargetDb: args.truePeakTargetDb,
  };
}
