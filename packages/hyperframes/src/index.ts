/*
 * `@studio/hyperframes`: the only code that starts a HyperFrames process (SPEC 0008 section 4.4,
 * K3). `ensureBrowser` and `locateInstalledChrome` are for the CLI's `chrome install` only; the
 * watcher imports `renderPicture` and never those two (AC 69).
 */
export { ensureBrowser, locateInstalledChrome, type InstalledChrome } from './browser';
export { hashChromeBinary, verifyChromeBinary, type RecordedChromeBinary } from './chrome-binary';
export { prepareConfigDir, type PrepareConfigOutcome } from './config-dir';
export {
  HyperframesChromeMissingError,
  HyperframesPinMismatchError,
  HyperframesProcessFailedError,
  HyperframesProcessStartError,
  HyperframesRuntimeError,
  HyperframesSandboxUnavailableError,
  type ChromeMissingDetail,
  type HyperframesRuntimeFailure,
  type PinMismatchDetail,
} from './errors';
export { realPathOfExistingPrefix, resolveExecutable } from './executable-paths';
export { FakeHyperframesProcessPort } from './fake-process-port';
export { workspaceRoot } from './package-paths';
export {
  checkPicture,
  type PictureCheck,
  type PictureCheckId,
  type PictureCheckRequest,
  type PictureExpectation,
  type PictureProbe,
  type RunProbe,
} from './picture-check';
export { pinnedBinPath } from './pinned-bin';
export { createSpawnProcessPort, type HyperframesProcessPort, type HyperframesProcessRequest } from './process-port';
export {
  SANDBOX_EXEC_PATH,
  buildBrowserEnsureArgv,
  buildBrowserEnsureEnv,
  buildRenderArgv,
  buildRenderEnv,
  type ProcessCommand,
} from './render-command';
export {
  checkRenderRuntime,
  completeRenderRuntime,
  type CheckedRenderRuntime,
  type RenderRuntimeAnswer,
  type RenderRuntimeRequest,
  type StartingProcess,
} from './render-runtime-gate';
export { fakeRenderRuntimeSystem, realRenderRuntimeSystem, type RenderRuntimeSystem } from './render-runtime-system';
export { checkInstallRuntime, completeInstallRuntime, type CheckedInstallRuntime } from './install-runtime';
export { enableReadiness } from './enable-readiness';
export { renderPicture, type RenderPicturePorts, type RenderPictureRequest } from './render-picture';
export { type HyperframesBaseRuntime, type HyperframesRuntime } from './runtime';
export { buildSandboxArgs, type SandboxArgsRequest } from './sandbox-args';
export { sandboxExecExists, sandboxProfile } from './sandbox-profile';
