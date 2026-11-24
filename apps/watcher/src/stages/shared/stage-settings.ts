import { DEVELOPMENT_RUNTIME, locateMediaTool, runtimeSearchPath, type StudioRuntime } from '@studio/core/runtime';
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

/*
 * A program the watcher starts: when set it must be absolute (baseline review 2026-11-21), so a
 * relative value can never resolve against whatever folder a child process happens to run in.
 */
const optionalAbsolutePath = z
  .string()
  .trim()
  .min(2)
  .max(4096)
  .startsWith('/')
  .optional()
  .or(z.literal('').transform((): undefined => undefined));

/*
 * The studio's loopback ports, read with the same names, defaults and bounds as the CLI and the api
 * (`ENGINEOS_VIDEO_CREATOR_API_PORT`, `ENGINEOS_VIDEO_CREATOR_WEB_PORT`). The HyperFrames sandbox denies both
 * (SPEC 0008 section 17.5, B11); an unset or empty variable takes the A9 default.
 */
const DEFAULT_API_PORT = 4311;
const DEFAULT_WEB_PORT = 4310;

const optionalPort = z
  .string()
  .trim()
  .regex(/^[0-9]{4,5}$/)
  .transform((value) => Number.parseInt(value, 10))
  .refine((port) => port >= 1024 && port <= 65535)
  .optional()
  .or(z.literal('').transform((): undefined => undefined));

const StageSettingsSchema = z
  .object({
    PATH: z.string().min(1).max(8192),
    HOME: optionalText,
    TMPDIR: optionalText,
    FFMPEG_PATH: optionalAbsolutePath,
    FFPROBE_PATH: optionalAbsolutePath,
    YT_DLP_PATH: optionalAbsolutePath,
    LOCAL_VOICE_PYTHON: optionalAbsolutePath,
    LOCAL_VOICE_SCRIPT: optionalText,
    ELEVENLABS_VOICE_ID: optionalText,
    ELEVENLABS_MODEL_ID: optionalText,
    ENGINEOS_VIDEO_CREATOR_API_PORT: optionalPort,
    ENGINEOS_VIDEO_CREATOR_WEB_PORT: optionalPort,
  })
  .strip();

export interface StageSettings {
  /** PATH handed to every child process; the only inherited variable besides HOME and TMPDIR. */
  path: string;
  home: string | null;
  tmpDir: string | null;
  ffmpegPath: string;
  ffprobePath: string;
  /**
   * Fetches the video of a link reference for its analysis. Never bundled: `YT_DLP_PATH` (absolute)
   * or `yt-dlp` on the PATH, in packaged mode too, where a missing tool ends the job `tool-missing`.
   */
  ytDlpPath: string;
  localVoice: { pythonPath: string; scriptPath: string } | null;
  elevenLabs: { voiceId: string | null; modelId: string };
  /** The studio's loopback ports, 1024 to 65535; the HyperFrames sandbox denies both (SPEC 0008 B11). */
  studioPorts: { api: number; web: number };
}

/** Seed default of the `elevenlabs-voice` row (`seeds/catalog.seed.json`, `defaultModelId`). */
const DEFAULT_ELEVENLABS_MODEL_ID = 'eleven_multilingual_v2';

/** Resolved on the child's PATH when `YT_DLP_PATH` is unset. */
const DEFAULT_YT_DLP_COMMAND = 'yt-dlp';

export const STAGE_SETTINGS = Symbol('STAGE_SETTINGS');

export class InvalidStageSettingsError extends Error {
  constructor(readonly variables: readonly string[]) {
    super(`Invalid stage settings: ${variables.join(', ')}`);
    this.name = 'InvalidStageSettingsError';
  }
}

/**
 * Validates the named variables only; values are never logged or written to a run file. In
 * packaged mode (plan C3 rev 2) ffmpeg and ffprobe are the bundled binaries and `FFMPEG_PATH` /
 * `FFPROBE_PATH` are ignored, so no program outside the app can be selected (DI-AC-03); the
 * runtime defaults to development so every existing caller keeps today's resolution.
 */
export function readStageSettings(environment: Readonly<Record<string, string | undefined>>, runtime: StudioRuntime = DEVELOPMENT_RUNTIME): StageSettings {
  const parsed = StageSettingsSchema.safeParse(environment);
  if (!parsed.success) {
    throw new InvalidStageSettingsError(parsed.error.issues.map((issue) => String(issue.path[0] ?? 'environment')));
  }
  const values = parsed.data;
  const localVoice =
    values.LOCAL_VOICE_PYTHON !== undefined && values.LOCAL_VOICE_SCRIPT !== undefined
      ? { pythonPath: values.LOCAL_VOICE_PYTHON, scriptPath: values.LOCAL_VOICE_SCRIPT }
      : null;
  const ffmpeg = locateMediaTool(runtime, 'ffmpeg');
  const ffprobe = locateMediaTool(runtime, 'ffprobe');
  return {
    path: runtimeSearchPath(runtime, values.PATH),
    home: values.HOME ?? null,
    tmpDir: values.TMPDIR ?? null,
    ffmpegPath: ffmpeg.source === 'bundled' ? ffmpeg.path : (values.FFMPEG_PATH ?? ffmpeg.name),
    ffprobePath: ffprobe.source === 'bundled' ? ffprobe.path : (values.FFPROBE_PATH ?? ffprobe.name),
    ytDlpPath: values.YT_DLP_PATH ?? DEFAULT_YT_DLP_COMMAND,
    localVoice,
    elevenLabs: { voiceId: values.ELEVENLABS_VOICE_ID ?? null, modelId: values.ELEVENLABS_MODEL_ID ?? DEFAULT_ELEVENLABS_MODEL_ID },
    studioPorts: { api: values.ENGINEOS_VIDEO_CREATOR_API_PORT ?? DEFAULT_API_PORT, web: values.ENGINEOS_VIDEO_CREATOR_WEB_PORT ?? DEFAULT_WEB_PORT },
  };
}
