import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FakeHyperframesProcessPort,
  HyperframesSandboxUnavailableError,
  buildRenderArgv,
  buildSandboxArgs,
  renderPicture,
  type HyperframesRuntime,
} from '@studio/hyperframes';
import { PARENT_ENV_SENTINELS, expectedRenderArgs, runtimeFixture, withParentEnv } from './hyperframes-runtime.fixtures.harness.test';

/*
 * The gaps of AC 87 (SPEC 0008 section 17.5, K15, K16) that render-command.test.ts and
 * render-picture.test.ts leave open: values with spaces, the refusals before any start and the
 * independence from `process.env`. The 47-argument shape itself is covered there. Every path is a
 * plain string; nothing is read, created or started.
 */

const TEMPLATE_DIR = '/fixture/scratch/render-0001/staged-template';
const VARIABLES_FILE = '/fixture/scratch/render-0001/variables.json';
const PICTURE_FILE = '/fixture/scratch/render-0001/picture.mp4';

/** `-f <profile>` plus seventeen `-D NAME=value` pairs. */
const SANDBOX_ARGUMENT_COUNT = 36;

type RuntimePathField =
  | 'sandboxProfilePath'
  | 'ownerConfigDir'
  | 'ownerHomeDir'
  | 'studioRoot'
  | 'dataHomeRoot'
  | 'hyperframesRoot'
  | 'configDir'
  | 'cacheDir'
  | 'homeDir'
  | 'chromeDir'
  | 'tmpDir'
  | 'nodePath'
  | 'browserPath'
  | 'ffmpegBin'
  | 'ffprobeBin';

type RuntimePortField = 'apiPort' | 'webPort';

/** Every path the sandbox arguments carry, named by what reaches `sandbox-exec`. */
const RUNTIME_PATH_FIELDS: readonly { label: string; field: RuntimePathField }[] = [
  { label: '-f profile', field: 'sandboxProfilePath' },
  { label: 'OWNER_HYPERFRAMES_DIR', field: 'ownerConfigDir' },
  { label: 'OWNER_HOME', field: 'ownerHomeDir' },
  { label: 'STUDIO_ROOT', field: 'studioRoot' },
  { label: 'DATA_HOME', field: 'dataHomeRoot' },
  { label: 'HF_ROOT', field: 'hyperframesRoot' },
  { label: 'HF_CONFIG_DIR', field: 'configDir' },
  { label: 'HF_CACHE_DIR', field: 'cacheDir' },
  { label: 'HF_HOME_DIR', field: 'homeDir' },
  { label: 'CHROME_DIR', field: 'chromeDir' },
  { label: 'SCRATCH_DIR', field: 'tmpDir' },
  { label: 'NODE_BIN', field: 'nodePath' },
  { label: 'CHROME_BIN', field: 'browserPath' },
  { label: 'FFMPEG_BIN', field: 'ffmpegBin' },
  { label: 'FFPROBE_BIN', field: 'ffprobeBin' },
];

const RUNTIME_PORT_FIELDS: readonly { label: string; field: RuntimePortField }[] = [
  { label: 'STUDIO_API_PORT', field: 'apiPort' },
  { label: 'STUDIO_WEB_PORT', field: 'webPort' },
];

/** Path values that must refuse before any start: not absolute, empty, or holding a NUL or line break. */
const REFUSED_PATH_VALUES: readonly { label: string; value: string }[] = [
  { label: 'a relative path', value: 'fixture/relative/folder' },
  { label: 'an empty value', value: '' },
  { label: 'a NUL', value: '/fixture/before\0after' },
  { label: 'a line feed', value: '/fixture/before\nafter' },
  { label: 'a carriage return', value: '/fixture/before\rafter' },
];

/** Port values outside the integers 1024 to 65535. */
const REFUSED_PORT_VALUES: readonly number[] = [1023, 65536, 0, 4310.5, Number.NaN];

/** Variables named like the sandbox parameters and the watcher's port settings; none may be read. */
const PARAMETER_NAMED_SENTINELS: Readonly<Record<string, string>> = Object.freeze({
  OWNER_HYPERFRAMES_DIR: '/sentinel/env/owner-hyperframes',
  OWNER_HOME: '/sentinel/env/owner-home',
  STUDIO_ROOT: '/sentinel/env/studio-root',
  DATA_HOME: '/sentinel/env/data-home',
  NODE_BIN: '/sentinel/env/node',
  FFMPEG_BIN: '/sentinel/env/ffmpeg',
  FFPROBE_BIN: '/sentinel/env/ffprobe',
  STUDIO_API_PORT: '2048',
  STUDIO_WEB_PORT: '2049',
  ENGINEOS_VIDEO_CREATOR_API_PORT: '2050',
  ENGINEOS_VIDEO_CREATOR_WEB_PORT: '2051',
});

function runtimeWithPath(field: RuntimePathField, value: string): HyperframesRuntime {
  const runtime = runtimeFixture();
  runtime[field] = value;
  return runtime;
}

function runtimeWithPort(field: RuntimePortField, value: number): HyperframesRuntime {
  const runtime = runtimeFixture();
  runtime[field] = value;
  return runtime;
}

function isSandboxUnavailable(error: unknown): boolean {
  return error instanceof HyperframesSandboxUnavailableError && error.reason === 'sandbox-unavailable';
}

function renderRequest(runtime: HyperframesRuntime, templateDir = TEMPLATE_DIR): Parameters<typeof buildRenderArgv>[0] {
  return { templateDir, variablesFile: VARIABLES_FILE, output: PICTURE_FILE, runtime };
}

function assertNoSentinelValue(args: readonly string[], sentinels: Readonly<Record<string, string>>): void {
  for (const [key, sentinel] of Object.entries(sentinels)) {
    assert.ok(!args.some((argument) => argument.includes(sentinel)), `an argument carries the parent value of ${key}`);
  }
}

describe('buildSandboxArgs arguments (AC 87, section 17.5)', () => {
  it('returns exactly the -f and seventeen -D arguments that open the render argv', () => {
    const runtime = runtimeFixture();

    const args = buildSandboxArgs({ templateDir: TEMPLATE_DIR, runtime });

    assert.deepEqual(
      [...args],
      expectedRenderArgs({ runtime, templateDir: TEMPLATE_DIR, variablesFile: VARIABLES_FILE, output: PICTURE_FILE }).slice(0, SANDBOX_ARGUMENT_COUNT),
    );
  });

  it('gives the render argv the same sandbox arguments it returns on its own', () => {
    const runtime = runtimeFixture();

    const sandboxArgs = buildSandboxArgs({ templateDir: TEMPLATE_DIR, runtime });
    const renderArgs = buildRenderArgv(renderRequest(runtime)).args;

    assert.deepEqual(renderArgs.slice(0, SANDBOX_ARGUMENT_COUNT), [...sandboxArgs]);
  });

  it('keeps every value that holds spaces as one NAME=value argument', () => {
    const runtime = runtimeFixture({
      ownerHomeDir: '/fixture/owner home',
      studioRoot: '/fixture/my studio/workspace',
      ffmpegBin: '/fixture/tools dir/bin/ffmpeg',
    });
    const templateDir = '/fixture/scratch/render 0001/staged copy';

    const args = buildSandboxArgs({ templateDir, runtime });

    assert.equal(args.length, SANDBOX_ARGUMENT_COUNT);
    assert.ok(args.includes('OWNER_HOME=/fixture/owner home'));
    assert.ok(args.includes('STUDIO_ROOT=/fixture/my studio/workspace'));
    assert.ok(args.includes('FFMPEG_BIN=/fixture/tools dir/bin/ffmpeg'));
    assert.ok(args.includes('TEMPLATE_DIR=/fixture/scratch/render 0001/staged copy'));
  });

  it('keeps a staged template folder with spaces as one argument of the 47-argument render argv', () => {
    const templateDir = '/fixture/scratch/render 0001/staged copy';

    const command = buildRenderArgv(renderRequest(runtimeFixture(), templateDir));

    assert.equal(command.args.length, 47);
    assert.equal(command.args.filter((argument) => argument === `TEMPLATE_DIR=${templateDir}`).length, 1);
  });

  it('accepts the port boundaries 1024 and 65535', () => {
    const runtime = runtimeFixture({ apiPort: 1024, webPort: 65535 });

    const args = buildSandboxArgs({ templateDir: TEMPLATE_DIR, runtime });

    assert.ok(args.includes('STUDIO_API_PORT=1024'));
    assert.ok(args.includes('STUDIO_WEB_PORT=65535'));
  });
});

describe('buildSandboxArgs refusals (AC 87, K16)', () => {
  for (const { label, field } of RUNTIME_PATH_FIELDS) {
    for (const refused of REFUSED_PATH_VALUES) {
      it(`throws sandbox-unavailable for ${refused.label} in ${label}`, () => {
        const runtime = runtimeWithPath(field, refused.value);

        assert.throws(() => buildSandboxArgs({ templateDir: TEMPLATE_DIR, runtime }), isSandboxUnavailable);
      });
    }
  }

  for (const refused of REFUSED_PATH_VALUES) {
    it(`throws sandbox-unavailable for ${refused.label} in TEMPLATE_DIR`, () => {
      const runtime = runtimeFixture();

      assert.throws(() => buildSandboxArgs({ templateDir: refused.value, runtime }), isSandboxUnavailable);
    });
  }

  for (const { label, field } of RUNTIME_PORT_FIELDS) {
    for (const port of REFUSED_PORT_VALUES) {
      it(`throws sandbox-unavailable for ${label} ${port}`, () => {
        const runtime = runtimeWithPort(field, port);

        assert.throws(() => buildSandboxArgs({ templateDir: TEMPLATE_DIR, runtime }), isSandboxUnavailable);
      });
    }
  }
});

describe('buildRenderArgv refusals (AC 87, K16)', () => {
  for (const refused of REFUSED_PATH_VALUES) {
    it(`throws sandbox-unavailable for ${refused.label} in FFMPEG_BIN`, () => {
      const runtime = runtimeWithPath('ffmpegBin', refused.value);

      assert.throws(() => buildRenderArgv(renderRequest(runtime)), isSandboxUnavailable);
    });

    it(`throws sandbox-unavailable for ${refused.label} in TEMPLATE_DIR`, () => {
      assert.throws(() => buildRenderArgv(renderRequest(runtimeFixture(), refused.value)), isSandboxUnavailable);
    });
  }

  for (const { label, field } of RUNTIME_PORT_FIELDS) {
    for (const port of [1023, 65536]) {
      it(`throws sandbox-unavailable for ${label} ${port}`, () => {
        const runtime = runtimeWithPort(field, port);

        assert.throws(() => buildRenderArgv(renderRequest(runtime)), isSandboxUnavailable);
      });
    }
  }

  it('starts nothing through renderPicture when a sandbox parameter is a relative path', async () => {
    const processPort = new FakeHyperframesProcessPort();
    const request = renderRequest(runtimeWithPath('chromeDir', 'relative/chrome'));

    await assert.rejects(renderPicture(request, { process: processPort, sandboxExecExists: () => true }), isSandboxUnavailable);
    assert.equal(processPort.requests.length, 0);
  });

  it('starts nothing through renderPicture when a port is outside 1024 to 65535', async () => {
    const processPort = new FakeHyperframesProcessPort();
    const request = renderRequest(runtimeWithPort('apiPort', 65536));

    await assert.rejects(renderPicture(request, { process: processPort, sandboxExecExists: () => true }), isSandboxUnavailable);
    assert.equal(processPort.requests.length, 0);
  });
});

describe('sandbox arguments ignore the parent environment (AC 87)', () => {
  const plantedEnv = { ...PARENT_ENV_SENTINELS, ...PARAMETER_NAMED_SENTINELS };

  it('builds the same sandbox arguments whatever the parent environment holds', async () => {
    const runtime = runtimeFixture();
    const baseline = [...buildSandboxArgs({ templateDir: TEMPLATE_DIR, runtime })];

    const planted = await withParentEnv(plantedEnv, () => [...buildSandboxArgs({ templateDir: TEMPLATE_DIR, runtime })]);

    assert.deepEqual(planted, baseline);
    assertNoSentinelValue(planted, plantedEnv);
  });

  it('builds the same render argv whatever the parent environment holds', async () => {
    const runtime = runtimeFixture();
    const baseline = [...buildRenderArgv(renderRequest(runtime)).args];

    const planted = await withParentEnv(plantedEnv, () => [...buildRenderArgv(renderRequest(runtime)).args]);

    assert.deepEqual(planted, baseline);
    assertNoSentinelValue(planted, plantedEnv);
  });

  it('still refuses an out-of-range port when the parent environment holds a valid one', async () => {
    const runtime = runtimeWithPort('webPort', 1023);

    await withParentEnv(plantedEnv, () => {
      assert.throws(() => buildSandboxArgs({ templateDir: TEMPLATE_DIR, runtime }), isSandboxUnavailable);
    });
  });
});
