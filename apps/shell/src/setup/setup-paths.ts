import { join } from 'node:path';
import { type PackagedRuntime } from '@studio/core/runtime';

/*
 * Every absolute path setup and uninstall touch, computed once from the locator's packaged runtime
 * (C3 rev 3, plan 9.1) and the data home. No second copy of the bundle layout exists in the shell:
 * the runtime folders come from `@studio/core/runtime`, and only the file names inside a payload
 * (`dist/main.js`, the same entry the api uses) are joined here.
 */

/** launchd label of the watcher agent (install.sh, `scripts/lib/common.sh`). */
export const WATCHER_AGENT_LABEL = 'com.videostudio.watcher';

/** Same relative paths as the repository (plan 9.1); read by the optional-download step for host and size. */
const MODEL_SOURCE_SEGMENTS: readonly string[] = ['scripts', 'models', 'embedding-model.source.json'];
const MODEL_MANIFEST_SEGMENTS: readonly string[] = ['scripts', 'models', 'embedding-model.manifest.json'];

/** Built entry of a payload, as `locateServiceLaunch` uses for the api. */
const PAYLOAD_ENTRY_SEGMENTS: readonly string[] = ['dist', 'main.js'];

export interface DataHomeFolders {
  readonly root: string;
  readonly db: string;
  readonly assets: string;
  readonly runs: string;
  readonly logs: string;
  readonly databaseFile: string;
}

export interface SetupPaths {
  readonly runtime: PackagedRuntime;
  readonly appBundle: string;
  readonly cliMain: string;
  readonly watcherMain: string;
  readonly prismaSchema: string;
  readonly dataHome: DataHomeFolders;
  /** Setup's own record (optional-download answers, seeded version); lives in the data home, 600. */
  readonly setupStateFile: string;
  readonly launchAgentsFolder: string;
  readonly plistFile: string;
  /** `gui/<uid>` and `gui/<uid>/<label>`, as `scripts/lib/common.sh` builds them. */
  readonly launchdDomain: string;
  readonly launchdService: string;
  readonly modelSource: string;
  readonly modelManifest: string;
  readonly playwrightCli: string;
}

export interface SetupPathsSource {
  readonly runtime: PackagedRuntime;
  readonly appBundle: string;
  readonly homeDirectory: string;
  readonly dataHome: string;
  readonly uid: number;
}

/** Install.sh step 6 folders (D5); core creates the others at process start. */
function dataHomeFolders(root: string): DataHomeFolders {
  const db = join(root, 'db');
  return { root, db, assets: join(root, 'assets'), runs: join(root, 'runs'), logs: join(root, 'logs'), databaseFile: join(db, 'studio.sqlite') };
}

export function setupPaths(source: SetupPathsSource): SetupPaths {
  const { runtime } = source;
  const launchAgentsFolder = join(source.homeDirectory, 'Library', 'LaunchAgents');
  const launchdDomain = `gui/${source.uid}`;
  return {
    runtime,
    appBundle: source.appBundle,
    cliMain: join(runtime.payload.cli, ...PAYLOAD_ENTRY_SEGMENTS),
    watcherMain: join(runtime.payload.watcher, ...PAYLOAD_ENTRY_SEGMENTS),
    prismaSchema: join(runtime.resources, 'packages', 'core', 'prisma', 'schema.prisma'),
    dataHome: dataHomeFolders(source.dataHome),
    setupStateFile: join(source.dataHome, 'setup-state.json'),
    launchAgentsFolder,
    plistFile: join(launchAgentsFolder, `${WATCHER_AGENT_LABEL}.plist`),
    launchdDomain,
    launchdService: `${launchdDomain}/${WATCHER_AGENT_LABEL}`,
    modelSource: join(runtime.resources, ...MODEL_SOURCE_SEGMENTS),
    modelManifest: join(runtime.resources, ...MODEL_MANIFEST_SEGMENTS),
    playwrightCli: join(runtime.sharedNodeModules, 'playwright', 'cli.js'),
  };
}
