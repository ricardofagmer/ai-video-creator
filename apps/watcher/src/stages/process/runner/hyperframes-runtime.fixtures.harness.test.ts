import assert from 'node:assert/strict';
import { type HyperframesRuntime } from '@studio/hyperframes';

/*
 * Fixtures for the tool-runner handler tests (SPEC 0008 section 4.5). The `@studio/hyperframes`
 * unit tests keep their own copy in that package, which the watcher cannot import from. Every path
 * here is a plain string: nothing is read, created or started from it.
 */

/** Values planted in the parent environment; none may reach a child environment (AC 67). */
export const PARENT_ENV_SENTINELS: Readonly<Record<string, string>> = Object.freeze({
  ANTHROPIC_API_KEY: 'sentinel-anthropic-key-planted',
  ELEVENLABS_API_KEY: 'sentinel-elevenlabs-key-planted',
  STUDIO_ARBITRARY_PARENT_VARIABLE: 'sentinel-arbitrary-variable-planted',
});

/** The eleven keys of section 4.5 plus HYPERFRAMES_CHROME_SANDBOX (section 18.6), sorted; no other key may exist in a render environment. */
export const RENDER_ENV_KEYS: readonly string[] = Object.freeze(
  [
    'DO_NOT_TRACK',
    'HOME',
    'HYPERFRAMES_BROWSER_PATH',
    'HYPERFRAMES_CACHE_DIR',
    'HYPERFRAMES_CHROME_SANDBOX',
    'HYPERFRAMES_CONFIG_DIR',
    'HYPERFRAMES_NO_TELEMETRY',
    'HYPERFRAMES_NO_UPDATE_CHECK',
    'HYPERFRAMES_SKIP_SKILLS',
    'LANG',
    'PATH',
    'TMPDIR',
  ].sort(),
);

export function runtimeFixture(overrides: Partial<HyperframesRuntime> = {}): HyperframesRuntime {
  return {
    nodePath: '/fixture/runner/bin/node',
    binPath: '/fixture/workspace/node_modules/.pnpm/hyperframes@0.9.72/node_modules/hyperframes/bin/hyperframes.mjs',
    browserPath: '/fixture/data-home/hyperframes/cache/browser/headless-shell',
    configDir: '/fixture/data-home/hyperframes/config',
    cacheDir: '/fixture/data-home/hyperframes/cache',
    homeDir: '/fixture/data-home/hyperframes/home',
    tmpDir: '/fixture/scratch/render-0001',
    path: '/fixture/tools/bin:/usr/bin:/bin',
    sandboxProfilePath: '/fixture/workspace/packages/hyperframes/sandbox/render.sb',
    ownerConfigDir: '/fixture/owner-home/.hyperframes',
    // SPEC 0008 section 17.5 (rev 2): the nine sandbox inputs, each a real path or a port.
    ownerHomeDir: '/fixture/owner-home',
    studioRoot: '/fixture/workspace',
    dataHomeRoot: '/fixture/data-home',
    hyperframesRoot: '/fixture/data-home/hyperframes',
    chromeDir: '/fixture/data-home/hyperframes/cache/chrome',
    ffmpegBin: '/fixture/tools/bin/ffmpeg',
    ffprobeBin: '/fixture/tools/bin/ffprobe',
    apiPort: 4311,
    webPort: 4310,
    ...overrides,
  };
}

/** The section 4.5 table restated as the oracle for `buildRenderEnv` and the recorded child env. */
export function expectedRenderEnv(runtime: HyperframesRuntime): Record<string, string> {
  return {
    PATH: runtime.path,
    LANG: 'C.UTF-8',
    HOME: runtime.homeDir,
    TMPDIR: runtime.tmpDir,
    HYPERFRAMES_NO_TELEMETRY: '1',
    DO_NOT_TRACK: '1',
    HYPERFRAMES_NO_UPDATE_CHECK: '1',
    HYPERFRAMES_SKIP_SKILLS: '1',
    HYPERFRAMES_CONFIG_DIR: runtime.configDir,
    HYPERFRAMES_CACHE_DIR: runtime.cacheDir,
    HYPERFRAMES_BROWSER_PATH: runtime.browserPath,
    HYPERFRAMES_CHROME_SANDBOX: '0',
  };
}

/**
 * The frozen argv restated as the oracle: section 4.4 (OD5 answer b) with the seventeen `-D` pairs
 * of section 17.5 (rev 2) in their frozen order, 47 arguments in all; the command is separate.
 */
export function expectedRenderArgs(options: {
  runtime: HyperframesRuntime;
  templateDir: string;
  variablesFile: string;
  output: string;
}): string[] {
  const { runtime } = options;
  return [
    '-f',
    runtime.sandboxProfilePath,
    '-D', `OWNER_HYPERFRAMES_DIR=${runtime.ownerConfigDir}`,
    '-D', `OWNER_HOME=${runtime.ownerHomeDir}`,
    '-D', `STUDIO_ROOT=${runtime.studioRoot}`,
    '-D', `DATA_HOME=${runtime.dataHomeRoot}`,
    '-D', `HF_ROOT=${runtime.hyperframesRoot}`,
    '-D', `HF_CONFIG_DIR=${runtime.configDir}`,
    '-D', `HF_CACHE_DIR=${runtime.cacheDir}`,
    '-D', `HF_HOME_DIR=${runtime.homeDir}`,
    '-D', `CHROME_DIR=${runtime.chromeDir}`,
    '-D', `SCRATCH_DIR=${runtime.tmpDir}`,
    '-D', `TEMPLATE_DIR=${options.templateDir}`,
    '-D', `NODE_BIN=${runtime.nodePath}`,
    '-D', `CHROME_BIN=${runtime.browserPath}`,
    '-D', `FFMPEG_BIN=${runtime.ffmpegBin}`,
    '-D', `FFPROBE_BIN=${runtime.ffprobeBin}`,
    '-D', `STUDIO_API_PORT=${runtime.apiPort}`,
    '-D', `STUDIO_WEB_PORT=${runtime.webPort}`,
    runtime.nodePath,
    runtime.binPath,
    'render',
    '--variables-file',
    options.variablesFile,
    '--strict-variables',
    '--strict',
    '--crf',
    '18',
    '-o',
    options.output,
  ];
}

/**
 * Runs `action` with `values` set in the parent's `process.env`, then restores every key to what it
 * was (deleted when it was absent), whether the action resolved or threw.
 */
export async function withParentEnv<T>(values: Readonly<Record<string, string>>, action: () => Promise<T> | T): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    return await action();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/** Fails unless no value and no key of `env` carries one of the planted parent sentinels. */
export function assertNoParentSentinel(env: Readonly<Record<string, string>>, sentinels: Readonly<Record<string, string>>): void {
  for (const [key, sentinel] of Object.entries(sentinels)) {
    assert.ok(!Object.hasOwn(env, key), `child environment carries the parent key ${key}`);
    for (const value of Object.values(env)) {
      assert.ok(!value.includes(sentinel), `child environment carries the parent value of ${key}`);
    }
  }
}
