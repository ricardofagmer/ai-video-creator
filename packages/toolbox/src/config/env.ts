import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import type { ProviderMode } from '@studio/shared/ace';
import { ConfigError } from '../errors';
import { findRepoRoot } from './repo-root';

export type CaptureViewport = 'desktop' | 'vertical';
/** Which engine speaks real ("live") narration. */
export type VoiceEngine = 'elevenlabs' | 'local';

export interface ToolboxEnv {
  repoRoot: string;
  runsDir: string;
  providerVoice: ProviderMode;
  voiceEngine: VoiceEngine;
  providerMedia: ProviderMode;
  captureAllowedHosts: readonly string[];
  captureViewport: CaptureViewport;
  maxCostPerVideoUsd: number;
  /** Estimate only; ElevenLabs bills per plan, so this is a guard rail, not an invoice. */
  elevenLabsUsdPerChar: number;
  defaultChannelId: string;
  ffmpegPath: string;
  ffprobePath: string;
}

export interface ElevenLabsConfig {
  apiKey: string;
  voiceId: string;
  modelId: string;
}

export interface LocalVoiceConfig {
  /** Python interpreter of the environment that holds the local voice model. */
  pythonPath: string;
  /** Batch script: `<python> <script> <job.json>`, job = { language, lines: [{ text, out }] }. */
  scriptPath: string;
  /** Language of narration that carries no language of its own (`ace narrate`). */
  language: string;
}

const DEFAULT_LOCAL_VOICE_LANGUAGE = 'en';

const DEFAULT_MAX_COST_USD = 3;
const DEFAULT_USD_PER_CHAR = 0.0003;

function readTrimmed(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function readMode(name: string): ProviderMode {
  const value = readTrimmed(name) ?? 'mock';
  if (value === 'mock' || value === 'live') return value;
  throw new ConfigError(`${name} must be "mock" or "live", got "${value}"`);
}

function readVoiceEngine(): VoiceEngine {
  const value = readTrimmed('VOICE_ENGINE') ?? 'elevenlabs';
  if (value === 'elevenlabs' || value === 'local') return value;
  throw new ConfigError(`VOICE_ENGINE must be "elevenlabs" or "local", got "${value}"`);
}

function readPositiveNumber(name: string, fallback: number): number {
  const raw = readTrimmed(name);
  if (raw === undefined) return fallback;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value <= 0) throw new ConfigError(`${name} must be a positive number, got "${raw}"`);
  return value;
}

function readViewport(): CaptureViewport {
  const value = readTrimmed('CAPTURE_VIEWPORT') ?? 'desktop';
  if (value === 'desktop' || value === 'vertical') return value;
  throw new ConfigError(`CAPTURE_VIEWPORT must be "desktop" or "vertical", got "${value}"`);
}

/** Loads <repoRoot>/.env (shell variables win) and reads the non-secret toolbox settings. */
export function loadEnvironment(): ToolboxEnv {
  const repoRoot = findRepoRoot();
  loadDotenv({ path: join(repoRoot, '.env'), quiet: true });
  return {
    repoRoot,
    runsDir: resolve(repoRoot, readTrimmed('ACE_RUNS_DIR') ?? 'runs'),
    providerVoice: readMode('PROVIDER_VOICE'),
    voiceEngine: readVoiceEngine(),
    providerMedia: readMode('PROVIDER_MEDIA'),
    captureAllowedHosts: (readTrimmed('CAPTURE_ALLOWED_HOSTS') ?? '')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter((host) => host.length > 0),
    captureViewport: readViewport(),
    maxCostPerVideoUsd: readPositiveNumber('MAX_COST_PER_VIDEO_USD', DEFAULT_MAX_COST_USD),
    elevenLabsUsdPerChar: readPositiveNumber('ELEVENLABS_USD_PER_CHAR', DEFAULT_USD_PER_CHAR),
    defaultChannelId: readTrimmed('ACE_CHANNEL_ID') ?? 'default',
    ffmpegPath: readTrimmed('FFMPEG_PATH') ?? 'ffmpeg',
    ffprobePath: readTrimmed('FFPROBE_PATH') ?? 'ffprobe',
  };
}

/** Fails fast, naming every missing variable, before any credit is spent. */
export function requireElevenLabsConfig(): ElevenLabsConfig {
  const apiKey = readTrimmed('ELEVENLABS_API_KEY');
  const voiceId = readTrimmed('ELEVENLABS_VOICE_ID');
  const missing = [apiKey ? null : 'ELEVENLABS_API_KEY', voiceId ? null : 'ELEVENLABS_VOICE_ID'].filter(
    (name): name is string => name !== null,
  );
  if (!apiKey || !voiceId) {
    throw new ConfigError(`PROVIDER_VOICE=live needs ${missing.join(' and ')} (set them in .env or the shell)`);
  }
  return { apiKey, voiceId, modelId: readTrimmed('ELEVENLABS_MODEL_ID') ?? 'eleven_multilingual_v2' };
}

/** Fails fast, naming what is missing, before a long local synthesis starts. */
export function requireLocalVoiceConfig(repoRoot: string): LocalVoiceConfig {
  const python = readTrimmed('LOCAL_VOICE_PYTHON');
  const script = readTrimmed('LOCAL_VOICE_SCRIPT');
  const missing = [python ? null : 'LOCAL_VOICE_PYTHON', script ? null : 'LOCAL_VOICE_SCRIPT'].filter(
    (name): name is string => name !== null,
  );
  if (!python || !script) {
    throw new ConfigError(`VOICE_ENGINE=local needs ${missing.join(' and ')} (set them in .env or the shell)`);
  }
  const pythonPath = resolve(repoRoot, python);
  const scriptPath = resolve(repoRoot, script);
  if (!existsSync(pythonPath)) throw new ConfigError(`LOCAL_VOICE_PYTHON does not exist: ${pythonPath}`);
  if (!existsSync(scriptPath)) throw new ConfigError(`LOCAL_VOICE_SCRIPT does not exist: ${scriptPath}`);
  return { pythonPath, scriptPath, language: readTrimmed('LOCAL_VOICE_LANG') ?? DEFAULT_LOCAL_VOICE_LANGUAGE };
}
