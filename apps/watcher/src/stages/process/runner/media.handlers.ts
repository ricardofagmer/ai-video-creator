import { runCaptionBurn } from '@ace/toolbox/dist/commands/media/caption-burn';
import { runFades } from '@ace/toolbox/dist/commands/media/fades';
import { runMediaReview } from '@ace/toolbox/dist/commands/media/media-review';
import { runMusicBed } from '@ace/toolbox/dist/commands/media/music-bed';
import { runTool } from '@ace/toolbox/dist/media/exec-tool';
import { probeMedia } from '@ace/toolbox/dist/media/ffprobe';
import { ENCODE_TIMEOUT_MS, FFMPEG_WRITE_ARGS, H264_VIDEO_ARGS, type MediaToolPaths } from '@ace/toolbox/dist/media/media-tools';
import { estimateWordTimings } from '@ace/toolbox/dist/narration/estimate-word-timings';
import { type z } from 'zod';
import {
  type CaptionBurnRequestSchema,
  type FadesRequestSchema,
  type MediaReviewRequestSchema,
  type MediaReviewResult,
  type MusicBedRequestSchema,
  type NarrationAssembleRequestSchema,
  type NarrationAssembleResult,
  type SlateRenderRequestSchema,
  type TestCaptureRequestSchema,
} from '../tool-runner.protocol';
import { fileInputArgs } from './ffmpeg-input';

type MediaReviewRequest = z.infer<typeof MediaReviewRequestSchema>;
type MusicBedRequest = z.infer<typeof MusicBedRequestSchema>;
type FadesRequest = z.infer<typeof FadesRequestSchema>;
type CaptionBurnRequest = z.infer<typeof CaptionBurnRequestSchema>;
type SlateRenderRequest = z.infer<typeof SlateRenderRequestSchema>;
type TestCaptureRequest = z.infer<typeof TestCaptureRequestSchema>;
type NarrationAssembleRequest = z.infer<typeof NarrationAssembleRequestSchema>;

/** Neutral slate colour of the mock composition: never mistaken for a black-frame run. */
const SLATE_COLOUR = '0x1f2a37';
const NARRATION_SAMPLE_RATE = '44100';

/*
 * Every handler takes the media programs resolved once at the runner's start (`runner-tools.ts`);
 * a request's own `tools` field is ignored. The C9 argument objects are strict, so each is built
 * field by field from the request.
 */
export async function mediaReview(request: MediaReviewRequest, tools: MediaToolPaths): Promise<MediaReviewResult> {
  const result = await runMediaReview(tools, {
    input: request.input,
    container: request.container,
    videoCodec: request.videoCodec,
    audioCodec: request.audioCodec,
    width: request.width,
    height: request.height,
    fps: request.fps,
    minDurationS: request.minDurationS,
    maxDurationS: request.maxDurationS,
    loudnessTargetLufs: request.loudnessTargetLufs,
    loudnessToleranceLu: request.loudnessToleranceLu,
    truePeakCeilingDbfs: request.truePeakCeilingDbfs,
    maxBlackRunS: request.maxBlackRunS,
  });
  return { passed: result.passed, checks: result.checks, measured: result.measured };
}

export async function musicBed(request: MusicBedRequest, tools: MediaToolPaths): Promise<{ durationS: number }> {
  const result = await runMusicBed(tools, {
    input: request.input,
    output: request.output,
    music: request.music,
    loudnessTargetLufs: request.loudnessTargetLufs,
    truePeakTargetDb: request.truePeakTargetDb,
  });
  return { durationS: result.durationS };
}

export async function fades(request: FadesRequest, tools: MediaToolPaths): Promise<{ durationS: number }> {
  const result = await runFades(tools, { input: request.input, output: request.output });
  return { durationS: result.durationS };
}

export async function captionBurn(request: CaptionBurnRequest, tools: MediaToolPaths): Promise<{ durationS: number }> {
  await runCaptionBurn(tools, {
    input: request.input,
    output: request.output,
    srt: request.srt,
    verticalAnchor: request.verticalAnchor,
  });
  const probe = await probeMedia(tools.ffprobePath, request.output);
  return { durationS: probe.durationS };
}

/** Mock composition: a plain slate at the recipe canvas and fps carrying the real narration audio. */
export async function slateRender(request: SlateRenderRequest, tools: MediaToolPaths): Promise<{ durationS: number }> {
  const duration = request.durationS.toFixed(3);
  await runTool(
    tools.ffmpegPath,
    [
      ...FFMPEG_WRITE_ARGS,
      '-f', 'lavfi',
      '-i', `color=c=${SLATE_COLOUR}:s=${request.width}x${request.height}:r=${request.fps}:d=${duration}`,
      ...fileInputArgs(request.audio),
      '-map', '0:v', '-map', '1:a',
      ...H264_VIDEO_ARGS,
      '-c:a', 'aac', '-b:a', '192k', '-ar', NARRATION_SAMPLE_RATE,
      '-t', duration,
      '-movflags', '+faststart',
      request.output,
    ],
    ENCODE_TIMEOUT_MS,
  );
  return { durationS: request.durationS };
}

/** Mock capture: ffmpeg's test pattern, local and deterministic, no browser and no network. */
export async function testCapture(request: TestCaptureRequest, tools: MediaToolPaths): Promise<{ durationS: number }> {
  const duration = request.durationS.toFixed(3);
  await runTool(
    tools.ffmpegPath,
    [
      ...FFMPEG_WRITE_ARGS,
      '-f', 'lavfi',
      '-i', `testsrc2=s=${request.width}x${request.height}:r=30:d=${duration}`,
      ...H264_VIDEO_ARGS,
      '-an',
      request.output,
    ],
    ENCODE_TIMEOUT_MS,
  );
  return { durationS: request.durationS };
}

/**
 * One narration track from per-scene clips, in scene order. Word timings are spread over each
 * clip's measured duration (toolbox `estimateWordTimings`), the same rule the toolbox applies to
 * voices that return no timings.
 */
export async function narrationAssemble(request: NarrationAssembleRequest, tools: MediaToolPaths): Promise<NarrationAssembleResult> {
  const sceneTimings: NarrationAssembleResult['sceneTimings'] = [];
  const words: NarrationAssembleResult['words'] = [];
  let offsetS = 0;
  for (const clip of request.clips) {
    const probe = await probeMedia(tools.ffprobePath, clip.path);
    sceneTimings.push({ sceneId: clip.sceneId, startS: offsetS, endS: offsetS + probe.durationS });
    words.push(...estimateWordTimings(clip.text, probe.durationS, offsetS));
    offsetS += probe.durationS;
  }
  const inputs = request.clips.flatMap((clip) => fileInputArgs(clip.path));
  const labels = request.clips.map((_clip, index) => `[${index}:a]`).join('');
  await runTool(
    tools.ffmpegPath,
    [
      ...FFMPEG_WRITE_ARGS,
      ...inputs,
      '-filter_complex', `${labels}concat=n=${request.clips.length}:v=0:a=1[narration]`,
      '-map', '[narration]',
      '-ar', NARRATION_SAMPLE_RATE, '-ac', '1', '-c:a', 'pcm_s16le',
      request.output,
    ],
    ENCODE_TIMEOUT_MS,
  );
  return { durationS: offsetS, sceneTimings, words };
}
