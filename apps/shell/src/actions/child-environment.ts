import { type ShellConfig } from '../config/shell-config';
import { portalOriginChildEnvironment } from '../portal/portal-settings';

/** Same fallback as the CLI's settings: a login item may start with no PATH at all. */
export const FALLBACK_PATH = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';

/** Non-secret variables passed through when the shell has them; nothing else of its environment is. */
const PASSED_THROUGH = ['HOME', 'TMPDIR', 'LANG'] as const;

/**
 * The `studio` child's whole environment: an explicit allowlist, never the shell's environment
 * wholesale, so no provider key and no `NODE_OPTIONS` can reach the CLI or the services it starts.
 * The studio variables come from the bundled configuration; the portal origin (a public address,
 * validated) comes from the shell's effective environment so `studio start` can hand it to the api.
 */
export function buildChildEnvironment(
  config: Pick<ShellConfig, 'dataHome' | 'webPort' | 'apiPort'>,
  parentEnvironment: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const parentPath = parentEnvironment['PATH'];
  const environment: Record<string, string> = { PATH: parentPath === undefined || parentPath === '' ? FALLBACK_PATH : parentPath };
  for (const name of PASSED_THROUGH) {
    const value = parentEnvironment[name];
    if (value !== undefined && value !== '') environment[name] = value;
  }
  Object.assign(environment, portalOriginChildEnvironment(parentEnvironment));
  environment['ENGINEOS_VIDEO_CREATOR_HOME'] = config.dataHome;
  environment['ENGINEOS_VIDEO_CREATOR_WEB_PORT'] = String(config.webPort);
  environment['ENGINEOS_VIDEO_CREATOR_API_PORT'] = String(config.apiPort);
  return environment;
}
