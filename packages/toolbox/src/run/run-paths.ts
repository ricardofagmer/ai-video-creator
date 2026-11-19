import { isAbsolute, resolve, sep } from 'node:path';
import { RunIdSchema, runFiles, type PipelineStage } from '@studio/shared/ace';
import type { ToolboxEnv } from '../config/env';
import { InputError } from '../errors';

/** Mock narration audio; runFiles.narrationAudio (mp3) is the live default. */
export const mockNarrationAudioFile = 'narration.wav';

/** Manifest file written for each pipeline stage. */
export const stageManifestFiles: Record<PipelineStage, string> = {
  research: runFiles.research,
  verify: runFiles.verify,
  script: runFiles.script,
  assets: runFiles.assets,
  narrate: runFiles.narrate,
  render: runFiles.render,
  qa: runFiles.qa,
};

function looksLikePath(argument: string): boolean {
  return isAbsolute(argument) || argument.includes('/') || argument.includes(sep) || argument.startsWith('.');
}

/** A <run> argument is either a runId under ACE_RUNS_DIR or a path to a run folder. */
export function resolveRunDir(env: ToolboxEnv, argument: string): string {
  if (looksLikePath(argument)) return resolve(process.cwd(), argument);
  const parsed = RunIdSchema.safeParse(argument);
  if (!parsed.success) {
    throw new InputError(`"${argument}" is neither a runId (like 2026-11-16-s1-meeting-notes) nor a path`, 'run ace list to see existing runs');
  }
  return resolve(env.runsDir, parsed.data);
}
