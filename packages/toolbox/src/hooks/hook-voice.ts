import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { HookLang, HookVoiceMode, WordTiming } from '@studio/shared/ace';
import { requireElevenLabsConfig, requireLocalVoiceConfig, type ToolboxEnv } from '../config/env';
import { InputError } from '../errors';
import { runTool } from '../media/exec-tool';
import { probeMedia } from '../media/ffprobe';
import { estimateWordTimings } from '../narration/estimate-word-timings';
import { ElevenLabsVoiceProvider } from '../providers/voice/elevenlabs-voice';
import { synthesizeLocalLines } from '../providers/voice/local-voice';

const SAY_TIMEOUT_MS = 60_000;
/** macOS ships `say` here; a fixed path keeps a PATH entry from substituting another program. */
const SAY_PATH = '/usr/bin/say';
/** macOS system voices for draft narration; the live voice comes from ELEVENLABS_VOICE_ID. */
const DRAFT_VOICES: Record<HookLang, string> = { pt: 'Luciana', en: 'Samantha' };

export interface NarrationLine {
  shotId: string;
  text: string;
}

export interface NarrationClip {
  shotId: string;
  path: string;
  words: WordTiming[];
}

export interface NarrationResult {
  clips: NarrationClip[];
  characters: number;
  usdEstimate: number;
}

async function draftClip(env: ToolboxEnv, lang: HookLang, line: NarrationLine, dir: string): Promise<NarrationClip> {
  const path = join(dir, `${line.shotId}.aiff`);
  await runTool(SAY_PATH, ['-v', DRAFT_VOICES[lang], '-o', path, '--', line.text], SAY_TIMEOUT_MS);
  const probe = await probeMedia(env.ffprobePath, path);
  return { shotId: line.shotId, path, words: estimateWordTimings(line.text, probe.durationS) };
}

/**
 * One clip per storyboard line. Draft uses macOS `say` (free, estimated timings). Live uses
 * the engine VOICE_ENGINE selects: the local cloned voice (free, estimated timings) or
 * ElevenLabs with character timestamps, which refuses to start past MAX_COST_PER_VIDEO_USD.
 */
export async function narrateLines(options: {
  env: ToolboxEnv;
  lang: HookLang;
  voice: HookVoiceMode;
  lines: NarrationLine[];
  dir: string;
  log: (message: string) => void;
}): Promise<NarrationResult> {
  const { env, lang, voice, lines, dir, log } = options;
  const characters = lines.reduce((sum, line) => sum + line.text.length, 0);
  if (voice === 'draft') {
    if (process.platform !== 'darwin') throw new InputError('--voice draft needs macOS `say`', 'use --voice live');
    const clips: NarrationClip[] = [];
    for (const line of lines) clips.push(await draftClip(env, lang, line, dir));
    return { clips, characters, usdEstimate: 0 };
  }

  if (env.voiceEngine === 'local') {
    const spoken = await synthesizeLocalLines({
      config: requireLocalVoiceConfig(env.repoRoot),
      language: lang,
      lines: lines.map((line) => ({ id: line.shotId, text: line.text })),
      dir,
      log,
    });
    const clips: NarrationClip[] = [];
    for (const clip of spoken) {
      const probe = await probeMedia(env.ffprobePath, clip.path);
      clips.push({ shotId: clip.id, path: clip.path, words: estimateWordTimings(clip.text, probe.durationS) });
    }
    return { clips, characters, usdEstimate: 0 };
  }

  const usdEstimate = characters * env.elevenLabsUsdPerChar;
  if (usdEstimate > env.maxCostPerVideoUsd) {
    throw new InputError(
      `live narration estimate $${usdEstimate.toFixed(2)} exceeds MAX_COST_PER_VIDEO_USD $${env.maxCostPerVideoUsd.toFixed(2)}`,
      'shorten the lines or raise MAX_COST_PER_VIDEO_USD',
    );
  }
  const provider = new ElevenLabsVoiceProvider({ config: requireElevenLabsConfig(), usdPerCharacter: env.elevenLabsUsdPerChar, log });
  const clips: NarrationClip[] = [];
  for (const line of lines) {
    const result = await provider.synthesize({ text: line.text });
    const path = join(dir, `${line.shotId}.mp3`);
    await writeFile(path, result.audio);
    clips.push({ shotId: line.shotId, path, words: result.words });
  }
  return { clips, characters, usdEstimate };
}
