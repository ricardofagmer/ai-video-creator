import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import { ExternalToolError } from '@ace/toolbox/dist/errors';
import { type MediaToolPaths } from '@ace/toolbox/dist/media/media-tools';

/**
 * ffmpeg and ffprobe for one tool-runner process, resolved once at its start from its own
 * environment (`FFMPEG_PATH`, `FFPROBE_PATH`, `PATH`), never from a request. A set variable must be
 * an absolute path to an executable file; an unset one falls back to the default name found in an
 * absolute PATH entry. Commands that need no media tools still run when resolution fails.
 */
export type RunnerTools =
  | { status: 'resolved'; paths: MediaToolPaths; sources: { ffmpeg: ToolSource; ffprobe: ToolSource } }
  | { status: 'unavailable'; reason: string };

type ToolSource = 'setting' | 'path-lookup';

type ToolResolution = { ok: true; path: string; source: ToolSource } | { ok: false; reason: string };

/** Codes that mean "no usable program here"; anything else is a real failure and propagates. */
const NOT_A_PROGRAM_CODES: ReadonlySet<string> = new Set(['ENOENT', 'ENOTDIR', 'EACCES', 'ELOOP']);

function isExecutableFile(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && typeof error.code === 'string' && NOT_A_PROGRAM_CODES.has(error.code)) return false;
    throw error;
  }
}

function resolveTool(variable: string, defaultName: string, environment: Readonly<Record<string, string | undefined>>): ToolResolution {
  const value = environment[variable];
  if (value !== undefined && value !== '') {
    if (!isAbsolute(value)) return { ok: false, reason: `${variable} must be an absolute path` };
    if (!isExecutableFile(value)) return { ok: false, reason: `${variable} is not an executable file` };
    return { ok: true, path: value, source: 'setting' };
  }
  // Relative PATH entries would resolve against the working directory, so they are skipped.
  for (const directory of (environment['PATH'] ?? '').split(delimiter)) {
    if (!isAbsolute(directory)) continue;
    const candidate = join(directory, defaultName);
    if (isExecutableFile(candidate)) return { ok: true, path: candidate, source: 'path-lookup' };
  }
  return { ok: false, reason: `${defaultName} was not found on PATH and ${variable} is unset` };
}

export function resolveRunnerTools(environment: Readonly<Record<string, string | undefined>>): RunnerTools {
  const ffmpeg = resolveTool('FFMPEG_PATH', 'ffmpeg', environment);
  const ffprobe = resolveTool('FFPROBE_PATH', 'ffprobe', environment);
  if (!ffmpeg.ok || !ffprobe.ok) {
    const reasons = [ffmpeg, ffprobe].flatMap((resolution) => (resolution.ok ? [] : [resolution.reason]));
    return { status: 'unavailable', reason: reasons.join('; ') };
  }
  return {
    status: 'resolved',
    paths: { ffmpegPath: ffmpeg.path, ffprobePath: ffprobe.path },
    sources: { ffmpeg: ffmpeg.source, ffprobe: ffprobe.source },
  };
}

/** The one startup log line; tool paths are configuration, not secrets. */
export function describeRunnerTools(tools: RunnerTools): string {
  if (tools.status === 'unavailable') return `tool-runner: media tools unavailable (${tools.reason})`;
  return `tool-runner: ffmpeg=${tools.paths.ffmpegPath} (${tools.sources.ffmpeg}) ffprobe=${tools.paths.ffprobePath} (${tools.sources.ffprobe})`;
}

/** The resolved paths for a media command; an unavailable tool fails it as a tool error. */
export function requireRunnerTools(tools: RunnerTools): MediaToolPaths {
  if (tools.status === 'unavailable') throw new ExternalToolError(`media tools unavailable: ${tools.reason}`, 'ffmpeg');
  return tools.paths;
}
