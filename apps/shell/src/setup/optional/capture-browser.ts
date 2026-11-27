import { isAbsolute } from 'node:path';
import { packagedChildEnvironment, type SetupContext } from '../setup-context';
import { type ProcessRequest } from '../process-runner';
import { type ComponentPresence, type OptionalComponent } from './optional-component';

/** Chromium only, as install.sh step 9 (`playwright install chromium`). */
const BROWSER_NAME = 'chromium';

const INSTALL_LOCATION = /^\s*Install location:\s*(\S.*?)\s*$/;

/*
 * Why no download is offered (DI-AC-04 requires host AND size before any consent): the bundled
 * Playwright's `install --dry-run chromium` prints a title, the install location and the download
 * URLs, but no size, and its `browsers.json` carries revisions and versions only. Playwright learns
 * the size from the Content-Length of the download itself, so nothing in the staged payload states
 * it, and a size is never guessed. Until a build step records a measured size, an absent browser is
 * reported `unavailable` (the setup window lists it as not installed); an installed one is still
 * recognised.
 */

/** The bundled Playwright CLI under the bundled node; the default browser cache in the user's home. */
function playwrightRequest(context: SetupContext, args: readonly string[], captureStdout: boolean): ProcessRequest {
  const { paths } = context;
  return {
    command: paths.runtime.nodeBinary,
    args: [paths.playwrightCli, ...args],
    cwd: paths.runtime.sharedNodeModules,
    env: packagedChildEnvironment(context),
    ...(captureStdout ? { captureStdout: true } : {}),
  };
}

/** Every folder `install --dry-run chromium` names; empty when the dry run failed or printed none. */
export function installLocationsOf(dryRunOutput: string): readonly string[] {
  const locations: string[] = [];
  for (const line of dryRunOutput.split('\n')) {
    const match = INSTALL_LOCATION.exec(line);
    const location = match?.[1];
    if (location !== undefined && isAbsolute(location)) locations.push(location);
  }
  return locations;
}

/** Installed when the dry run names at least one folder and every folder it names exists. */
async function isBrowserInstalled(context: SetupContext): Promise<boolean> {
  const result = await context.run(playwrightRequest(context, ['install', '--dry-run', BROWSER_NAME], true));
  if (result.kind !== 'exited' || result.code !== 0) return false;
  const locations = installLocationsOf(result.stdout);
  if (locations.length === 0) return false;
  for (const location of locations) {
    if ((await context.files.inspect(location)).kind !== 'folder') return false;
  }
  return true;
}

/** Install.sh step 9: the Chromium the toolbox's page capture drives. */
export function captureBrowserComponent(context: SetupContext): OptionalComponent {
  return {
    id: 'capture-browser',
    async presence(): Promise<ComponentPresence> {
      return (await isBrowserInstalled(context)) ? { kind: 'installed' } : { kind: 'unavailable' };
    },
    // Reached only after an `absent` offer and the user's yes, which this component never makes today.
    async install() {
      const result = await context.run(playwrightRequest(context, ['install', BROWSER_NAME], false));
      if (result.kind !== 'exited' || result.code !== 0) return false;
      return isBrowserInstalled(context);
    },
  };
}
