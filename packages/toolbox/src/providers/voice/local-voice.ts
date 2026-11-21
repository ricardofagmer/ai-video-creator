import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { VoiceProvider, VoiceRequest, VoiceResult, WordTiming } from '@studio/shared/ace';
import type { LocalVoiceConfig } from '../../config/env';
import { ProviderError } from '../../errors';
import { runTool } from '../../media/exec-tool';
import { probeMedia } from '../../media/ffprobe';
import { fileInputArgs } from '../../media/media-tools';
import { estimateWordTimings } from '../../narration/estimate-word-timings';

// The local model runs far slower than real time (about 25x on an Apple M5), so a 90 s
// narration can take most of an hour.
const BATCH_TIMEOUT_MS = 90 * 60_000;
const FFMPEG_TIMEOUT_MS = 120_000;
const OUTPUT_SAMPLE_RATE = '44100';
const OUTPUT_BITRATE = '128k';

export interface LocalVoiceLine {
  id: string;
  text: string;
}

export interface LocalVoiceClip {
  id: string;
  text: string;
  path: string;
}

export interface LocalVoiceBatch {
  config: LocalVoiceConfig;
  language: string;
  lines: readonly LocalVoiceLine[];
  /** Clips are written here as `<id>.wav`. */
  dir: string;
  log: (message: string) => void;
}

/** Speaks every line in one run of the local voice script, so the model loads once. */
export async function synthesizeLocalLines(batch: LocalVoiceBatch): Promise<LocalVoiceClip[]> {
  const { config, language, lines, dir, log } = batch;
  const clips = lines.map((line) => ({ id: line.id, text: line.text, path: join(dir, `${line.id}.wav`) }));
  const jobPath = join(dir, 'local-voice-job.json');
  await writeFile(jobPath, JSON.stringify({ language, lines: clips.map((clip) => ({ text: clip.text, out: clip.path })) }));
  log(`local voice: speaking ${lines.length} lines (${language}); this runs far slower than real time`);
  await runTool(config.pythonPath, [config.scriptPath, jobPath], BATCH_TIMEOUT_MS);
  for (const clip of clips) {
    const written = await stat(clip.path).catch(() => null);
    if (!written || written.size === 0) throw new ProviderError(`local voice wrote no audio for line "${clip.id}"`, 'local-voice');
  }
  return clips;
}

/** Splits narration at sentence ends: the local model speaks at most about 40 s per call. */
export function splitSentences(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [];
  return sentences.map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 0);
}

export interface LocalVoiceOptions {
  config: LocalVoiceConfig;
  ffmpegPath: string;
  ffprobePath: string;
  log: (message: string) => void;
}

/** The owner's cloned voice, spoken by a local model; word timings are estimated per sentence. */
export class LocalVoiceProvider implements VoiceProvider {
  constructor(private readonly options: LocalVoiceOptions) {}

  async synthesize(input: VoiceRequest): Promise<VoiceResult> {
    const { config, ffmpegPath, ffprobePath, log } = this.options;
    const sentences = splitSentences(input.text);
    if (sentences.length === 0) throw new ProviderError('narration text has no sentences', 'local-voice');
    const workDir = await mkdtemp(join(tmpdir(), 'ace-local-voice-'));
    try {
      const lines = sentences.map((text, index) => ({ id: `s${String(index + 1).padStart(3, '0')}`, text }));
      const clips = await synthesizeLocalLines({ config, language: config.language, lines, dir: workDir, log });

      const words: WordTiming[] = [];
      let offsetS = 0;
      for (const clip of clips) {
        const { durationS } = await probeMedia(ffprobePath, clip.path);
        words.push(...estimateWordTimings(clip.text, durationS, offsetS));
        offsetS += durationS;
      }

      const outPath = join(workDir, 'narration.mp3');
      await runTool(
        ffmpegPath,
        [
          '-hide_banner', '-loglevel', 'error', '-y',
          ...clips.flatMap((clip) => fileInputArgs(clip.path)),
          '-filter_complex', `concat=n=${clips.length}:v=0:a=1`,
          '-ar', OUTPUT_SAMPLE_RATE, '-c:a', 'libmp3lame', '-b:a', OUTPUT_BITRATE,
          outPath,
        ],
        FFMPEG_TIMEOUT_MS,
      );
      return {
        audio: await readFile(outPath),
        mimeType: 'audio/mpeg',
        durationS: offsetS,
        voice: `local:chatterbox-multilingual:${config.language}`,
        words,
        usage: [{ provider: 'local-voice', unit: 'characters', quantity: input.text.length, usdEstimate: 0 }],
      };
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }
}
