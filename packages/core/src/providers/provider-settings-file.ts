import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ProviderNameSchema } from '@studio/shared/run-format';
import { z } from 'zod';
import { type DataHome } from '../paths/data-home';
import { CLAUDE_BINARY_VARIABLE, CLAUDE_ENGINE_VARIABLE } from './claude-engine.config';
import { modeVariable } from './provider-modes.config';
import { InvalidProviderModeConfigError } from './providers.errors';

/** `<data home>/providers.json`: the owner's provider modes for an app opened from Finder, which carries no shell variables. */
export const PROVIDER_SETTINGS_FILE_NAME = 'providers.json';

const MAX_SETTINGS_FILE_BYTES = 16 * 1024;

/** The watcher's local voice program (C11), validated by its stage settings reader. */
export const LOCAL_VOICE_PYTHON_VARIABLE = 'LOCAL_VOICE_PYTHON';
export const LOCAL_VOICE_SCRIPT_VARIABLE = 'LOCAL_VOICE_SCRIPT';

/** The default ElevenLabs voice and speech model, validated by the watcher's stage settings reader. Public ids, never the key. */
export const ELEVENLABS_VOICE_ID_VARIABLE = 'ELEVENLABS_VOICE_ID';
export const ELEVENLABS_MODEL_ID_VARIABLE = 'ELEVENLABS_MODEL_ID';

/*
 * Values stay strings here: the environment readers (`readProviderModeSettings`,
 * `readClaudeEngineSettings`) validate them exactly as they validate the variables, so the file
 * cannot express anything a variable cannot. It holds no keys; credentials stay in the keychain.
 */
const ProviderSettingsFileSchema = z
  .object({
    modes: z.partialRecord(ProviderNameSchema, z.string().max(32)).optional(),
    claudeEngine: z.string().max(32).optional(),
    claudeBin: z.string().max(1024).optional(),
    localVoicePython: z.string().max(1024).optional(),
    localVoiceScript: z.string().max(1024).optional(),
    elevenLabsVoiceId: z.string().max(128).optional(),
    elevenLabsModelId: z.string().max(128).optional(),
  })
  .strict();

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function readSettingsText(file: string): string | null {
  try {
    if (statSync(file).size > MAX_SETTINGS_FILE_BYTES) throw new InvalidProviderModeConfigError(PROVIDER_SETTINGS_FILE_NAME);
    return readFileSync(file, 'utf8');
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

function parseSettings(text: string): z.infer<typeof ProviderSettingsFileSchema> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new InvalidProviderModeConfigError(PROVIDER_SETTINGS_FILE_NAME);
  }
  const parsed = ProviderSettingsFileSchema.safeParse(raw);
  if (!parsed.success) throw new InvalidProviderModeConfigError(PROVIDER_SETTINGS_FILE_NAME);
  return parsed.data;
}

/** The file as the variables it stands for; an absent file is no settings at all. */
function settingsFileVariables(dataHome: DataHome): Record<string, string> {
  const text = readSettingsText(join(dataHome.root, PROVIDER_SETTINGS_FILE_NAME));
  if (text === null) return {};
  const settings = parseSettings(text);
  const variables: Record<string, string> = {};
  for (const provider of ProviderNameSchema.options) {
    const mode = settings.modes?.[provider];
    if (mode !== undefined) variables[modeVariable(provider)] = mode;
  }
  if (settings.claudeEngine !== undefined) variables[CLAUDE_ENGINE_VARIABLE] = settings.claudeEngine;
  if (settings.claudeBin !== undefined) variables[CLAUDE_BINARY_VARIABLE] = settings.claudeBin;
  if (settings.localVoicePython !== undefined) variables[LOCAL_VOICE_PYTHON_VARIABLE] = settings.localVoicePython;
  if (settings.localVoiceScript !== undefined) variables[LOCAL_VOICE_SCRIPT_VARIABLE] = settings.localVoiceScript;
  if (settings.elevenLabsVoiceId !== undefined) variables[ELEVENLABS_VOICE_ID_VARIABLE] = settings.elevenLabsVoiceId;
  if (settings.elevenLabsModelId !== undefined) variables[ELEVENLABS_MODEL_ID_VARIABLE] = settings.elevenLabsModelId;
  return variables;
}

/**
 * The environment the provider readers see: the settings file first, then every non-empty
 * variable on top, so an explicit variable always wins over the file.
 */
export function providerSettingsEnvironment(
  dataHome: DataHome,
  environment: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  const merged: Record<string, string | undefined> = settingsFileVariables(dataHome);
  for (const [name, value] of Object.entries(environment)) {
    if (value !== undefined && value.trim() !== '') merged[name] = value;
  }
  return merged;
}
