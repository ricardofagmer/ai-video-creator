import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { InvalidProviderModeConfigError } from './providers.errors';

/**
 * Which engine answers live Claude calls (ADR 0011). `api` is the Claude API through Mastra
 * (ADR 0002); `claude-code` is the Claude Code CLI installed on the Mac, on the owner's
 * subscription. Read only when the `claude` provider is live; mock ignores it.
 */
export const ClaudeEngineSchema = z.enum(['api', 'claude-code']);
export type ClaudeEngine = z.infer<typeof ClaudeEngineSchema>;

export interface ClaudeEngineSettings {
  readonly engine: ClaudeEngine;
  /** Absolute path of the CLI; null means `claude` is resolved on PATH. */
  readonly binary: string | null;
}

/** Nest token for the parsed settings. */
export const CLAUDE_ENGINE_SETTINGS = Symbol('CLAUDE_ENGINE_SETTINGS');

export const CLAUDE_ENGINE_VARIABLE = 'ENGINEOS_VIDEO_CREATOR_CLAUDE_ENGINE';
export const CLAUDE_BINARY_VARIABLE = 'ENGINEOS_VIDEO_CREATOR_CLAUDE_BIN';

export const DEFAULT_CLAUDE_ENGINE_SETTINGS: ClaudeEngineSettings = { engine: 'api', binary: null };

const MAX_BINARY_PATH_LENGTH = 1024;

/**
 * Parsed once by the providers module factory. An unknown engine or a relative binary path fails
 * the start; the variable name is reported, never its value.
 */
export function readClaudeEngineSettings(environment: Readonly<Record<string, string | undefined>>): ClaudeEngineSettings {
  const engine = readEngine(environment[CLAUDE_ENGINE_VARIABLE]?.trim());
  const rawBinary = environment[CLAUDE_BINARY_VARIABLE]?.trim();
  if (rawBinary === undefined || rawBinary === '') return { engine, binary: null };
  if (rawBinary.length > MAX_BINARY_PATH_LENGTH || !isAbsolute(rawBinary)) throw new InvalidProviderModeConfigError(CLAUDE_BINARY_VARIABLE);
  return { engine, binary: rawBinary };
}

function readEngine(raw: string | undefined): ClaudeEngine {
  if (raw === undefined || raw === '') return DEFAULT_CLAUDE_ENGINE_SETTINGS.engine;
  const parsed = ClaudeEngineSchema.safeParse(raw);
  if (!parsed.success) throw new InvalidProviderModeConfigError(CLAUDE_ENGINE_VARIABLE);
  return parsed.data;
}
