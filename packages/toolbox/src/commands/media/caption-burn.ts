import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { InputError } from '../../errors';
import { renderCaptionImages, type CaptionImage } from '../../media/caption-images';
import { runTool } from '../../media/exec-tool';
import { probeMedia } from '../../media/ffprobe';
import { filePathArg, numberArg, parseCommandArgs } from '../../media/media-args';
import { prepareOutputFile, resolveInputFile } from '../../media/media-paths';
import { ENCODE_TIMEOUT_MS, FFMPEG_WRITE_ARGS, fileInputArgs, H264_VIDEO_ARGS, type MediaToolPaths } from '../../media/media-tools';
import { parseSrt, type CaptionCue } from '../../media/srt';

const MAX_CUES = 200;
const MAX_SRT_BYTES = 1024 * 1024;
const MAX_CUE_CHARS = 300;

/**
 * Contract C9 `caption-burn` arguments. `verticalAnchor` has no default on purpose: captions.py
 * fixed "bottom" at 74% of the height, which covered app buttons on 16:9 (RELATORIO.md), so the
 * recipe's format supplies the anchor (0 = top edge, 1 = bottom edge, caption centred on it).
 */
export const CaptionBurnArgsSchema = z
  .object({
    input: filePathArg,
    output: filePathArg,
    srt: filePathArg,
    verticalAnchor: numberArg(z.number().min(0).max(1)),
    style: z.enum(['bold', 'highlight', 'box']).default('bold'),
    fontFile: filePathArg.optional(),
    fontSizePx: numberArg(z.number().int().min(12).max(400)).optional(),
  })
  .strict();
export type CaptionBurnArgs = z.input<typeof CaptionBurnArgsSchema>;

export interface CaptionBurnResult {
  command: 'caption-burn';
  output: string;
  captions: number;
  style: 'bold' | 'highlight' | 'box';
  verticalAnchor: number;
  fontSizePx: number;
  /** The font file used, or "default" for the Arial-first system stack. */
  font: string;
}

async function readCues(srtPath: string): Promise<CaptionCue[]> {
  const { size } = await stat(srtPath);
  if (size > MAX_SRT_BYTES) throw new InputError(`SRT is over 1 MB: ${srtPath}`);
  const cues = parseSrt(await readFile(srtPath, 'utf8'));
  if (cues.length === 0) throw new InputError(`the SRT has no timed captions: ${srtPath}`);
  if (cues.length > MAX_CUES) throw new InputError(`${cues.length} captions exceed the limit of ${MAX_CUES}; split the video into parts`);
  const longCue = cues.findIndex((cue) => cue.text.length > MAX_CUE_CHARS);
  if (longCue >= 0) throw new InputError(`caption ${longCue + 1} is over ${MAX_CUE_CHARS} characters`);
  return cues;
}

interface OverlayPlan {
  cues: readonly CaptionCue[];
  images: readonly CaptionImage[];
  frameWidth: number;
  frameHeight: number;
  verticalAnchor: number;
}

/** One overlay per cue, chained; positions are integers computed here, never paths or text. */
function buildOverlayChain(plan: OverlayPlan): { graph: string; lastLabel: string } {
  const chain: string[] = [];
  let last = '0:v';
  plan.images.forEach((image, index) => {
    const cue = plan.cues[index];
    if (!cue) return;
    const x = Math.floor((plan.frameWidth - image.width) / 2);
    const centred = Math.round(plan.frameHeight * plan.verticalAnchor - image.height / 2);
    const y = Math.min(Math.max(0, centred), plan.frameHeight - image.height);
    const label = `v${index + 1}`;
    // End is exclusive: between() is inclusive on both ends, so back-to-back cues
    // would both draw on the frame that lands exactly on the shared boundary.
    chain.push(`[${last}][${index + 1}:v]overlay=${x}:${y}:enable='gte(t,${cue.startS.toFixed(3)})*lt(t,${cue.endS.toFixed(3)})'[${label}]`);
    last = label;
  });
  return { graph: chain.join(';'), lastLabel: last };
}

/**
 * Draws an SRT onto the video as overlaid images (port of captions.py `burn`). Captions are
 * built upstream from narration word timings (SPEC A16); speech-to-text is not part of this port.
 */
export async function runCaptionBurn(tools: MediaToolPaths, rawArgs: unknown): Promise<CaptionBurnResult> {
  const args = parseCommandArgs(CaptionBurnArgsSchema, rawArgs, 'caption-burn');
  const input = await resolveInputFile(args.input, 'input video');
  const srt = await resolveInputFile(args.srt, 'SRT file');
  const fontFile = args.fontFile ? await resolveInputFile(args.fontFile, 'font file') : null;
  const cues = await readCues(srt);
  const output = await prepareOutputFile(args.output, [input, srt]);
  const probe = await probeMedia(tools.ffprobePath, input);
  if (!probe.video || probe.video.width <= 0 || probe.video.height <= 0) throw new InputError(`input has no usable video stream: ${input}`);

  const { width: frameWidth, height: frameHeight } = probe.video;
  const fontSizePx = args.fontSizePx ?? Math.max(24, Math.floor(Math.min(frameWidth, frameHeight) * 0.075));
  const workDir = await mkdtemp(join(tmpdir(), 'studio-captions-'));
  try {
    const images = await renderCaptionImages({ cues, frameWidth, frameHeight, fontSizePx, style: args.style, fontFile, dir: workDir });
    const { graph, lastLabel } = buildOverlayChain({ cues, images, frameWidth, frameHeight, verticalAnchor: args.verticalAnchor });
    await runTool(
      tools.ffmpegPath,
      [
        ...FFMPEG_WRITE_ARGS,
        ...fileInputArgs(input),
        ...images.flatMap((image) => fileInputArgs(image.path)),
        '-filter_complex', graph,
        '-map', `[${lastLabel}]`, '-map', '0:a?',
        ...H264_VIDEO_ARGS,
        '-c:a', 'copy',
        '-movflags', '+faststart',
        output,
      ],
      ENCODE_TIMEOUT_MS,
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
  return {
    command: 'caption-burn',
    output,
    captions: cues.length,
    style: args.style,
    verticalAnchor: args.verticalAnchor,
    fontSizePx,
    font: fontFile ?? 'default',
  };
}
