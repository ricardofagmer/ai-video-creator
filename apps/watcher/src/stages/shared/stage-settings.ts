import { z } from 'zod';

/**
 * Process settings the stage executors need, read once by the composition root (never inside a
 * service). Names match the absorbed toolbox (`packages/toolbox/src/config/env.ts`) and the R1-07
 * seed (`ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID`), so one environment serves both. None of
 * them is a secret: the ElevenLabs key is read only through `ProviderModeService.credentialFor`.
 */
const optionalText = z
  .string()
  .trim()
  .min(1)
  .max(4096)
  .optional()
  .or(z.literal('').transform((): undefined => undefined));

const StageSettingsSchema = z
  .object({
    PATH: z.string().min(1).max(8192),
    HOME: optionalText,
    TMPDIR: optionalText,
    FFMPEG_PATH: optionalText,
    FFPROBE_PATH: optionalText,
    LOCAL_VOICE_PYTHON: optionalText,
    LOCAL_VOICE_SCRIPT: optionalText,
    ELEVENLABS_VOICE_ID: optionalText,
    ELEVENLABS_MODEL_ID: optionalText,
  })
  .strip();

export interface StageSettings {
  /** PATH handed to every child process; the only inherited variable besides HOME and TMPDIR. */
  path: string;
  home: string | null;
  tmpDir: string | null;
  ffmpegPath: string;
  ffprobePath: string;
  localVoice: { pythonPath: string; scriptPath: string } | null;
  elevenLabs: { voiceId: string | null; modelId: string };
}

/** Seed default of the `elevenlabs-voice` row (`seeds/catalog.seed.json`, `defaultModelId`). */
const DEFAULT_ELEVENLABS_MODEL_ID = 'eleven_multilingual_v2';

export const STAGE_SETTINGS = Symbol('STAGE_SETTINGS');

export class InvalidStageSettingsError extends Error {
  constructor(readonly variables: readonly string[]) {
    super(`Invalid stage settings: ${variables.join(', ')}`);
    this.name = 'InvalidStageSettingsError';
  }
}

/** Validates the named variables only; values are never logged or written to a run file. */
export function readStageSettings(environment: Readonly<Record<string, string | undefined>>): StageSettings {
  const parsed = StageSettingsSchema.safeParse(environment);
  if (!parsed.success) {
    throw new InvalidStageSettingsError(parsed.error.issues.map((issue) => String(issue.path[0] ?? 'environment')));
  }
  const values = parsed.data;
  const localVoice =
    values.LOCAL_VOICE_PYTHON !== undefined && values.LOCAL_VOICE_SCRIPT !== undefined
      ? { pythonPath: values.LOCAL_VOICE_PYTHON, scriptPath: values.LOCAL_VOICE_SCRIPT }
      : null;
  return {
    path: values.PATH,
    home: values.HOME ?? null,
    tmpDir: values.TMPDIR ?? null,
    ffmpegPath: values.FFMPEG_PATH ?? 'ffmpeg',
    ffprobePath: values.FFPROBE_PATH ?? 'ffprobe',
    localVoice,
    elevenLabs: { voiceId: values.ELEVENLABS_VOICE_ID ?? null, modelId: values.ELEVENLABS_MODEL_ID ?? DEFAULT_ELEVENLABS_MODEL_ID },
  };
}

/** ffmpeg and ffprobe as the C9 media commands take them. */
export function mediaToolPaths(settings: StageSettings): { ffmpegPath: string; ffprobePath: string } {
  return { ffmpegPath: settings.ffmpegPath, ffprobePath: settings.ffprobePath };
}
