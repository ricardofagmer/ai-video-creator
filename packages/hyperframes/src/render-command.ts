import { type HyperframesBaseRuntime, type HyperframesRuntime } from './runtime';
import { buildSandboxArgs } from './sandbox-args';

/*
 * The closed environment and the frozen argv of a HyperFrames process (SPEC 0008 sections 4.4 and
 * 4.5, K3, K4). Pure: built only from the runtime, never from `process.env`, so nothing of the
 * caller's environment (keys, tokens, proxies) can reach the CLI or its Chrome.
 */

export const SANDBOX_EXEC_PATH = '/usr/bin/sandbox-exec';

/** The ten keys every HyperFrames process gets; the render adds `HYPERFRAMES_BROWSER_PATH`. */
function baseEnv(runtime: HyperframesBaseRuntime): Record<string, string> {
  return {
    PATH: runtime.path,
    LANG: 'C.UTF-8',
    HOME: runtime.homeDir,
    TMPDIR: runtime.tmpDir,
    HYPERFRAMES_NO_TELEMETRY: '1',
    DO_NOT_TRACK: '1',
    // Also turns off the CLI's detached auto-install, which keys off the update check.
    HYPERFRAMES_NO_UPDATE_CHECK: '1',
    HYPERFRAMES_SKIP_SKILLS: '1',
    HYPERFRAMES_CONFIG_DIR: runtime.configDir,
    HYPERFRAMES_CACHE_DIR: runtime.cacheDir,
  };
}

/** The complete environment of a render: exactly the eleven keys of section 4.5. */
export function buildRenderEnv(runtime: HyperframesRuntime): Readonly<Record<string, string>> {
  return Object.freeze({ ...baseEnv(runtime), HYPERFRAMES_BROWSER_PATH: runtime.browserPath });
}

/**
 * The environment of `browser ensure` (section 5.5): the same list without
 * `HYPERFRAMES_BROWSER_PATH`, which would make the CLI use that path instead of installing.
 */
export function buildBrowserEnsureEnv(runtime: HyperframesBaseRuntime): Readonly<Record<string, string>> {
  return Object.freeze(baseEnv(runtime));
}

export interface ProcessCommand {
  command: string;
  args: readonly string[];
}

/**
 * The frozen render argv (OD5 answer b, SPEC 0008 section 17.5): `buildSandboxArgs`, then node,
 * the pinned bin and the spike's flags, nothing added. Throws `HyperframesSandboxUnavailableError`
 * before any start when a sandbox parameter is refused.
 */
export function buildRenderArgv(request: {
  templateDir: string;
  variablesFile: string;
  output: string;
  runtime: HyperframesRuntime;
}): ProcessCommand {
  const { runtime } = request;
  return {
    command: SANDBOX_EXEC_PATH,
    args: Object.freeze([
      ...buildSandboxArgs({ templateDir: request.templateDir, runtime }),
      runtime.nodePath,
      runtime.binPath,
      'render',
      '--variables-file',
      request.variablesFile,
      '--strict-variables',
      '--strict',
      '--crf',
      '18',
      '-o',
      request.output,
    ]),
  };
}

/** `browser ensure`, unsandboxed: the one HyperFrames process allowed to reach the network. */
export function buildBrowserEnsureArgv(runtime: HyperframesBaseRuntime): ProcessCommand {
  return { command: runtime.nodePath, args: Object.freeze([runtime.binPath, 'browser', 'ensure']) };
}
