import { delimiter, join } from 'node:path';
import { RUNTIME_DIR_ENV_VAR, type StudioRuntime } from './studio-runtime';

export type MediaToolName = 'ffmpeg' | 'ffprobe';

/**
 * Where a media program comes from. `search-path` is development mode: the bare name is looked up
 * by the caller exactly as before the locator (an explicit `FFMPEG_PATH` setting, then PATH).
 */
export type MediaToolLocation = { source: 'bundled'; path: string } | { source: 'search-path'; name: MediaToolName };

export function locateMediaTool(runtime: StudioRuntime, tool: MediaToolName): MediaToolLocation {
  if (runtime.mode === 'development') return { source: 'search-path', name: tool };
  return { source: 'bundled', path: tool === 'ffmpeg' ? runtime.ffmpeg : runtime.ffprobe };
}

/**
 * The node binary that starts a child process. Development keeps the caller's own running node
 * (`process.execPath`, never a PATH lookup); packaged mode always uses the pinned bundled node.
 */
export function locateNodeBinary(runtime: StudioRuntime, runningNode: string): string {
  return runtime.mode === 'development' ? runningNode : runtime.nodeBinary;
}

/**
 * The PATH a child receives. Packaged mode puts the bundled `bin/` and `node/bin/` first, so a
 * program a dependency looks up by bare name still resolves inside the app (DI-AC-03); development
 * returns the PATH unchanged.
 */
export function runtimeSearchPath(runtime: StudioRuntime, searchPath: string): string {
  if (runtime.mode === 'development') return searchPath;
  const bundled = [join(runtime.root, 'bin'), join(runtime.root, 'node', 'bin')].join(delimiter);
  return searchPath === '' ? bundled : `${bundled}${delimiter}${searchPath}`;
}

/**
 * A child's explicit environment with the runtime carried over: packaged mode passes the runtime
 * folder on (a child started with a minimal environment would otherwise fall back to development
 * mode) and prefixes PATH; development returns an unchanged copy.
 */
export function runtimeChildEnvironment(runtime: StudioRuntime, base: Readonly<Record<string, string>>): Record<string, string> {
  if (runtime.mode === 'development') return { ...base };
  return { ...base, PATH: runtimeSearchPath(runtime, base['PATH'] ?? ''), [RUNTIME_DIR_ENV_VAR]: runtime.root };
}

/**
 * The folder repository-relative resources are read from (`scripts/models/...`, `seeds/...`).
 * Development keeps the caller's checkout root; packaged mode uses `payload/resources/`, which keeps
 * the same relative layout, so call sites join the same relative path in both modes.
 */
export function locateResourceRoot(runtime: StudioRuntime, checkoutRoot: string): string {
  return runtime.mode === 'development' ? checkoutRoot : runtime.resources;
}

/**
 * The folder a HyperFrames sandbox names as `STUDIO_ROOT`, whose `.env` files it denies. Packaged
 * mode names the whole runtime folder rather than only the resources, so the deny covers every
 * staged payload; development keeps the checkout root.
 */
export function locateSandboxStudioRoot(runtime: StudioRuntime, checkoutRoot: string): string {
  return runtime.mode === 'development' ? checkoutRoot : runtime.root;
}
