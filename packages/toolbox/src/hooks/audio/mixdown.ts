import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hookSpec } from '@studio/shared/ace';
import { runTool } from '../../media/exec-tool';
import { encodeWavPcm24Stereo } from './stereo-wav';
import type { StereoBuffer } from './synth';

export interface VoiceClip {
  path: string;
  offsetS: number;
}

export interface MixHookAudioOptions {
  music: StereoBuffer;
  sfx: StereoBuffer;
  voiceClips: VoiceClip[];
  durationS: number;
  workDir: string;
  ffmpegPath: string;
}

export interface MixHookAudioResult {
  masterPath: string;
  integratedLufs: number;
  truePeakDb: number;
}

interface LoudnormMeasurement {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

const FFMPEG_TIMEOUT_MS = 5 * 60_000;
const TARGET_LRA = 11;
/** The limiter sits below the TP target because alimiter works on sample peaks, not true peaks. */
const PRE_LIMIT = 10 ** (-3 / 20);
const BASE_ARGS = ['-hide_banner', '-nostats', '-y'] as const;

async function ffmpeg(ffmpegPath: string, args: readonly string[]): Promise<string> {
  try {
    const { stderr } = await runTool(ffmpegPath, [...BASE_ARGS, ...args], FFMPEG_TIMEOUT_MS);
    return stderr;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`hook audio mixdown: ffmpeg exited with an error\n${detail}`);
  }
}

/** Voice bus: each clip resampled to 48 kHz stereo and delayed to its offset, then summed. */
function voiceGraph(clips: readonly VoiceClip[], firstInput: number): { filters: string[]; label: string } {
  const filters = clips.map((clip, index) => {
    const delayMs = Math.max(0, Math.round(clip.offsetS * 1000));
    return `[${firstInput + index}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${delayMs}:all=1[v${index}]`;
  });
  const inputs = clips.map((_, index) => `[v${index}]`).join('');
  filters.push(`${inputs}amix=inputs=${clips.length}:normalize=0:duration=longest[voice]`);
  return { filters, label: '[voice]' };
}

function premixGraph(clips: readonly VoiceClip[], durationS: number): string {
  const fit = `apad=whole_dur=${durationS},atrim=0:${durationS},asetpts=N/SR/TB`;
  if (clips.length === 0) return `[0:a][1:a]amix=inputs=2:normalize=0:duration=longest,${fit}[out]`;
  const voice = voiceGraph(clips, 2);
  return [
    ...voice.filters,
    `${voice.label}asplit=2[voicekey][voicemix]`,
    '[0:a][voicekey]sidechaincompress=threshold=0.04:ratio=5:attack=15:release=350:makeup=1[ducked]',
    `[ducked][1:a][voicemix]amix=inputs=3:normalize=0:duration=longest,${fit}[out]`,
  ].join(';');
}

function parseLoudnormJson(stderr: string): LoudnormMeasurement {
  const start = stderr.lastIndexOf('{');
  const end = stderr.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('hook audio mixdown: loudnorm printed no JSON measurement');
  const parsed: unknown = JSON.parse(stderr.slice(start, end + 1));
  if (typeof parsed !== 'object' || parsed === null) throw new Error('hook audio mixdown: loudnorm JSON is not an object');
  const field = (name: keyof LoudnormMeasurement): string => {
    const value: unknown = Reflect.get(parsed, name);
    if (typeof value !== 'string') throw new Error(`hook audio mixdown: loudnorm JSON lacks ${name}`);
    return value;
  };
  return {
    input_i: field('input_i'),
    input_tp: field('input_tp'),
    input_lra: field('input_lra'),
    input_thresh: field('input_thresh'),
    target_offset: field('target_offset'),
  };
}

function loudnormFilter(measured?: LoudnormMeasurement): string {
  const target = `loudnorm=I=${hookSpec.targetLufs}:TP=${hookSpec.maxTruePeakDb}:LRA=${TARGET_LRA}`;
  if (!measured) return `${target}:print_format=json`;
  return (
    `${target}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}` +
    `:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true:print_format=json`
  );
}

async function measureLoudnorm(ffmpegPath: string, inputPath: string, filter: string): Promise<LoudnormMeasurement> {
  return parseLoudnormJson(await ffmpeg(ffmpegPath, ['-i', inputPath, '-af', filter, '-f', 'null', '-']));
}

export async function measureEbur128(ffmpegPath: string, inputPath: string): Promise<{ integratedLufs: number; truePeakDb: number }> {
  const stderr = await ffmpeg(ffmpegPath, ['-i', inputPath, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const summary = stderr.slice(stderr.lastIndexOf('Summary:'));
  const integrated = /I:\s+(-?[\d.]+|-inf)\s+LUFS/.exec(summary);
  const peak = /True peak:\s+Peak:\s+(-?[\d.]+|-inf)\s+dBFS/.exec(summary);
  if (!integrated?.[1] || !peak?.[1]) throw new Error('hook audio mixdown: could not read the ebur128 summary');
  return { integratedLufs: Number.parseFloat(integrated[1]), truePeakDb: Number.parseFloat(peak[1]) };
}

/**
 * Mixes score stems and narration into master.wav at -14 LUFS / -1.5 dBTP. A gain + limiter
 * stage before the two loudnorm passes keeps the peak-to-loudness ratio low enough for
 * loudnorm to stay linear instead of falling back to dynamic compression.
 */
export async function mixHookAudio(options: MixHookAudioOptions): Promise<MixHookAudioResult> {
  const musicPath = join(options.workDir, 'music.wav');
  const sfxPath = join(options.workDir, 'sfx.wav');
  const premixPath = join(options.workDir, 'premix.wav');
  const limitedPath = join(options.workDir, 'limited.wav');
  const masterPath = join(options.workDir, 'master.wav');
  await writeFile(musicPath, encodeWavPcm24Stereo(options.music));
  await writeFile(sfxPath, encodeWavPcm24Stereo(options.sfx));

  const voiceInputs = options.voiceClips.flatMap((clip) => ['-i', clip.path]);
  await ffmpeg(options.ffmpegPath, [
    '-i', musicPath, '-i', sfxPath, ...voiceInputs,
    '-filter_complex', premixGraph(options.voiceClips, options.durationS),
    '-map', '[out]', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_f32le', premixPath,
  ]);

  const premix = await measureLoudnorm(options.ffmpegPath, premixPath, loudnormFilter());
  const gainDb = hookSpec.targetLufs - Number.parseFloat(premix.input_i);
  await ffmpeg(options.ffmpegPath, [
    '-i', premixPath,
    '-af', `volume=${gainDb.toFixed(2)}dB,alimiter=limit=${PRE_LIMIT.toFixed(4)}:attack=2:release=60:level=false`,
    '-ar', '48000', '-c:a', 'pcm_f32le', limitedPath,
  ]);

  const firstPass = await measureLoudnorm(options.ffmpegPath, limitedPath, loudnormFilter());
  await ffmpeg(options.ffmpegPath, [
    '-i', limitedPath, '-af', loudnormFilter(firstPass),
    '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', '-t', String(options.durationS), masterPath,
  ]);

  const measured = await measureEbur128(options.ffmpegPath, masterPath);
  return { masterPath, ...measured };
}
