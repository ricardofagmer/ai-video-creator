import { join } from 'node:path';
import { nodeRuntimeFileSystem, resolveStudioRuntime, type PackagedRuntime, type RuntimeFileSystem } from '@studio/core/runtime';
import { type ShellConfig } from './shell-config';

/*
 * Packaged mode (desktop installer, plan C3 rev 3). The dmg bakes no `shell-config.json`: the app's
 * own `Contents/Resources/runtime/` folder is the configuration. Its presence selects packaged mode;
 * the bundled node, the payload CLI and the default data home are derived from it through the core
 * locator, so the shell holds no second copy of the bundle layout. Development (no `runtime/`)
 * keeps reading `shell-config.json` exactly as before.
 */

/** Defaults of the CLI and core settings (`ENGINEOS_VIDEO_CREATOR_WEB_PORT` / `_API_PORT`). */
export const PACKAGED_WEB_PORT = 4310;
export const PACKAGED_API_PORT = 4311;

/**
 * `@studio/core/paths` default data home (`~/Library/Application Support/VideoStudio`). Rebuilt here
 * because that subpath also exports the Nest module, which must not enter the Electron bundle;
 * drift is a review item for the final gate.
 */
const DATA_HOME_SEGMENTS: readonly string[] = ['Library', 'Application Support', 'VideoStudio'];

const RUNTIME_FOLDER = 'runtime';

export type ShellMode = { readonly kind: 'packaged'; readonly runtime: PackagedRuntime } | { readonly kind: 'development' };

/**
 * Packaged when `<resourcesPath>/runtime` is a folder. A folder that exists but fails the locator's
 * checks is not silently treated as development: the locator's typed error propagates to the caller,
 * which shows the incomplete-installation menu.
 */
export function detectShellMode(resourcesPath: string | undefined, fileSystem: RuntimeFileSystem = nodeRuntimeFileSystem): ShellMode {
  if (resourcesPath === undefined || resourcesPath === '') return { kind: 'development' };
  const root = join(resourcesPath, RUNTIME_FOLDER);
  if (!fileSystem.isDirectory(root)) return { kind: 'development' };
  const runtime = resolveStudioRuntime({ override: root, fileSystem });
  return runtime.mode === 'packaged' ? { kind: 'packaged', runtime } : { kind: 'development' };
}

export function packagedDataHome(homeDirectory: string): string {
  return join(homeDirectory, ...DATA_HOME_SEGMENTS);
}

/** The shell configuration of a packaged app, with the same shape the menu and the invoker use. */
export function packagedShellConfig(runtime: PackagedRuntime, homeDirectory: string): ShellConfig {
  return {
    format: 1,
    nodeBinary: runtime.nodeBinary,
    cliMain: join(runtime.payload.cli, 'dist', 'main.js'),
    dataHome: packagedDataHome(homeDirectory),
    webPort: PACKAGED_WEB_PORT,
    apiPort: PACKAGED_API_PORT,
  };
}
