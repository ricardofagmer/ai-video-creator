import { hyperframesPaths } from '@studio/shared/hyperframes';
import { HyperframesPinMismatchError } from './errors';
import { type RenderRuntimeAnswer, type StartingProcess } from './render-runtime-gate';
import { realRenderRuntimeSystem, type RenderRuntimeSystem } from './render-runtime-system';
import { type HyperframesBaseRuntime } from './runtime';

/*
 * The runtime of `chrome install` (SPEC 0008 section 5.5), beside the render runtime gate. Install
 * runs `browser ensure` unsandboxed and is the step that creates `chrome.json`, so none of the
 * render checks apply: only the pin, asserted before the owner is asked anything so a wrong
 * install never downloads. The `config/`, `cache/` and `home/` folders are created after the
 * owner confirms, so they are named here, not resolved. Nothing here starts a process.
 */

/** The install runtime without the three fields only the starting process knows. */
export type CheckedInstallRuntime = Omit<HyperframesBaseRuntime, 'nodePath' | 'tmpDir' | 'path'>;

/** Whether `chrome install` may start: its runtime, or `pin-mismatch`. */
export function checkInstallRuntime(
  dataHomeRoot: string,
  system: Pick<RenderRuntimeSystem, 'pinnedBinPath'> = realRenderRuntimeSystem,
): RenderRuntimeAnswer<CheckedInstallRuntime> {
  let binPath: string;
  try {
    binPath = system.pinnedBinPath();
  } catch (error) {
    if (!(error instanceof HyperframesPinMismatchError)) throw error;
    return { status: 'refused', reason: 'pin-mismatch' };
  }
  const { configDir, cacheDir, homeDir } = hyperframesPaths(dataHomeRoot);
  return { status: 'ready', runtime: { binPath, configDir, cacheDir, homeDir } };
}

/** The install runtime completed in the process that runs `browser ensure`; unsandboxed, so no real paths. */
export function completeInstallRuntime(checked: CheckedInstallRuntime, starting: StartingProcess): HyperframesBaseRuntime {
  return { ...checked, nodePath: starting.nodePath, tmpDir: starting.tmpDir, path: starting.path };
}
