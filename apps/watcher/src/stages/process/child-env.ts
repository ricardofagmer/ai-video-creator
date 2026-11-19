import { type StageSettings } from '../shared/stage-settings';

/**
 * The explicit, minimal environment of every child process the stages start (ffmpeg through the
 * tool runner, Remotion, Playwright, the C11 local voice). `process.env` is never passed whole:
 * it can hold API keys and the toolbox's dotenv values, and a child must not see them.
 */
export function minimalChildEnv(settings: StageSettings, extra: Readonly<Record<string, string>> = {}): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { PATH: settings.path, LANG: 'C.UTF-8' };
  if (settings.home !== null) environment['HOME'] = settings.home;
  if (settings.tmpDir !== null) environment['TMPDIR'] = settings.tmpDir;
  return { ...environment, ...extra };
}
