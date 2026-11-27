import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { ExternalToolError } from '@ace/toolbox/dist/errors';
import { FakeHyperframesProcessPort, HyperframesProcessFailedError, type HyperframesRuntime, type PictureProbe } from '@studio/hyperframes';
import {
  PARENT_ENV_SENTINELS,
  RENDER_ENV_KEYS,
  assertNoParentSentinel,
  expectedRenderArgs,
  expectedRenderEnv,
  withParentEnv,
} from './hyperframes-runtime.fixtures.harness.test';
import { type HyperframesRenderRequest } from '../tool-runner.protocol';
import { PictureCheckError, hyperframesRender, type HyperframesRenderPorts } from './hyperframes.handlers';

/*
 * The tool-runner side of a HyperFrames render (SPEC 0008 section 5.2; AC 66, 67, 78, 79, 81).
 * Every start goes to `FakeHyperframesProcessPort` and every ffprobe run of the picture check to a
 * fake that answers ffprobe's JSON; the folders are `fs.mkdtemp` folders whose names carry a
 * sentinel, removed after each test. The probe parsing and the check rules themselves are tested
 * at `checkPicture` in `@studio/hyperframes`.
 *
 * Two parts of the handler are not ports: the sandbox check of `renderPicture` (an `existsSync` of
 * `/usr/bin/sandbox-exec`, never run) and the narration mux (`runTool`). The request's ffmpeg path
 * is the empty string, which Node refuses before any process is created; a handler that reaches
 * the mux therefore rejects with a plain `ExternalToolError`, distinct from `PictureCheckError`.
 */

const SENTINEL_VALUE = 'sentinel-variable-value-ac81';
const SENTINEL_PATH = 'sentinel-staged-path-ac81';
/**
 * The unresolved settings: the handler must never use them (SPEC 0008 sections 18.1 G3 and 18.5).
 * The empty ffmpeg setting is refused by Node's spawn argument check. The mux tries
 * `runtime.ffmpegBin` instead, a fixture path that does not exist, so the spawn fails with ENOENT.
 */
const UNSTARTABLE_FFMPEG = '';
const FFPROBE_SETTING = '/fixture/settings/ffprobe';
/** `runtime.ffprobeBin`, the resolved path the picture probe must use. */
const FFPROBE_FIXTURE = '/fixture/tools/ffprobe';
const NARRATION_S = 12.5;
const FPS = 30;

interface RenderWorld {
  root: string;
  request: HyperframesRenderRequest;
}

async function createRenderWorld(): Promise<RenderWorld> {
  const root = await mkdtemp(join(tmpdir(), `watcher-hf-render-${SENTINEL_PATH}-`));
  const templateDir = join(root, `staged-${SENTINEL_PATH}`);
  const scratchDir = join(root, 'scratch');
  await mkdir(templateDir);
  await mkdir(scratchDir);
  const request: HyperframesRenderRequest = {
    command: 'hyperframes-render',
    tools: { ffmpegPath: UNSTARTABLE_FFMPEG, ffprobePath: FFPROBE_SETTING },
    templateDir,
    variables: { title: `Title ${SENTINEL_VALUE}`, hook: 'A short hook', accentColor: '#ff0055', sceneCount: 3, showLogo: true },
    width: 1080,
    height: 1920,
    fps: FPS,
    durationS: NARRATION_S,
    audio: join(root, 'narration.wav'),
    output: join(root, 'composition.mp4'),
    scratchDir,
    runtime: {
      binPath: '/fixture/workspace/node_modules/hyperframes/bin/hyperframes.mjs',
      browserPath: '/fixture/data-home/hyperframes/cache/browser/headless-shell',
      configDir: '/fixture/data-home/hyperframes/config',
      cacheDir: '/fixture/data-home/hyperframes/cache',
      homeDir: '/fixture/data-home/hyperframes/home',
      sandboxProfilePath: '/fixture/workspace/packages/hyperframes/sandbox/render.sb',
      ownerConfigDir: '/fixture/owner-home/.hyperframes',
      // SPEC 0008 section 17.5 (rev 2): the nine sandbox inputs the parent resolves.
      ownerHomeDir: '/fixture/owner-home',
      studioRoot: '/fixture/workspace',
      dataHomeRoot: '/fixture/data-home',
      hyperframesRoot: '/fixture/data-home/hyperframes',
      chromeDir: '/fixture/data-home/hyperframes/cache/chrome',
      ffmpegBin: '/fixture/tools/ffmpeg',
      ffprobeBin: FFPROBE_FIXTURE,
      apiPort: 4311,
      webPort: 4310,
    },
  };
  return { root, request };
}

function matchingProbe(overrides: Partial<PictureProbe> = {}): PictureProbe {
  return { codec: 'h264', pixelFormat: 'yuv420p', width: 1080, height: 1920, fps: FPS, durationS: NARRATION_S, ...overrides };
}

/** ffprobe's JSON for a probe, or text that is not JSON for an unreadable picture. */
function ffprobeOutput(probe: PictureProbe | null): string {
  if (probe === null) return 'ffprobe: not json';
  return JSON.stringify({
    streams: [{ codec_name: probe.codec, pix_fmt: probe.pixelFormat, width: probe.width, height: probe.height, avg_frame_rate: `${probe.fps}/1` }],
    format: { duration: String(probe.durationS) },
  });
}

interface FakeRenderPorts {
  ports: HyperframesRenderPorts;
  processPort: FakeHyperframesProcessPort;
  probeCalls: { ffprobePath: string; file: string }[];
}

function fakeRenderPorts(options: { probe: PictureProbe | null; exitCodes?: readonly number[] }): FakeRenderPorts {
  const processPort = new FakeHyperframesProcessPort(options.exitCodes ?? []);
  const probeCalls: { ffprobePath: string; file: string }[] = [];
  return {
    processPort,
    probeCalls,
    ports: {
      process: processPort,
      runProbe(program: string, args: readonly string[]): Promise<string> {
        // The probed file is ffprobe's last argument.
        probeCalls.push({ ffprobePath: program, file: args.at(-1) ?? '' });
        return Promise.resolve(ffprobeOutput(options.probe));
      },
      // SPEC 0008 section 17.5 (rev 2): sandbox paths go through `realPath`; the fake answers each
      // path unchanged, so the expectations below keep the request's own paths.
      realPath(path: string): Promise<string> {
        return Promise.resolve(path);
      },
    },
  };
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => assert.fail('the render was expected to be refused'),
    (error: unknown) => error,
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

/**
 * The runtime the child must use (section 4.4): the request's runtime plus the runner's own node by
 * absolute path, the scratch directory as TMPDIR and the runner's PATH (`StageSettings.path`).
 * `completeRenderRuntime` resolves node and the scratch directory to real paths (section 17.5), so
 * a macOS `/var/folders/...` scratch reaches the child as `/private/var/folders/...`.
 */
async function expectedRuntimeOf(request: HyperframesRenderRequest): Promise<HyperframesRuntime> {
  const [nodePath, tmpDir] = await Promise.all([realpath(process.execPath), realpath(request.scratchDir)]);
  return { ...request.runtime, nodePath, tmpDir, path: process.env['PATH'] ?? '/usr/bin:/bin' };
}

describe('hyperframesRender', () => {
  let world: RenderWorld;

  beforeEach(async () => {
    world = await createRenderWorld();
  });

  afterEach(async () => {
    await rm(world.root, { recursive: true, force: true });
  });

  describe('the render start (AC 66, AC 67)', () => {
    it('starts one sandboxed render of the staged copy with the runner node and the frozen argv', async () => {
      const { ports, processPort } = fakeRenderPorts({ probe: null });

      await assert.rejects(hyperframesRender(world.request, ports), PictureCheckError);

      assert.equal(processPort.requests.length, 1);
      const [start] = processPort.requests;
      assert.ok(start !== undefined);
      assert.equal(start.command, '/usr/bin/sandbox-exec');
      assert.equal(start.cwd, world.request.templateDir);
      assert.deepEqual(
        [...start.args],
        expectedRenderArgs({
          runtime: await expectedRuntimeOf(world.request),
          templateDir: world.request.templateDir,
          variablesFile: join(world.request.scratchDir, 'variables.json'),
          output: join(world.request.scratchDir, 'picture.mp4'),
        }),
      );
    });

    it('gives the child exactly the eleven environment keys and none of the parent sentinels', async () => {
      const { ports, processPort } = fakeRenderPorts({ probe: null });

      await withParentEnv(PARENT_ENV_SENTINELS, () => assert.rejects(hyperframesRender(world.request, ports), PictureCheckError));

      const start = processPort.requests[0];
      assert.ok(start !== undefined);
      assert.deepEqual(Object.keys(start.env).sort(), RENDER_ENV_KEYS);
      assert.deepEqual({ ...start.env }, expectedRenderEnv(await expectedRuntimeOf(world.request)));
      assertNoParentSentinel(start.env, PARENT_ENV_SENTINELS);
    });
  });

  describe('variables.json (AC 78)', () => {
    it('writes variables.json in the scratch directory with mode 0600 holding exactly the request variables', async () => {
      const { ports } = fakeRenderPorts({ probe: null });

      await assert.rejects(hyperframesRender(world.request, ports), PictureCheckError);

      const variablesFile = join(world.request.scratchDir, 'variables.json');
      assert.equal((await stat(variablesFile)).mode & 0o777, 0o600);
      const written: unknown = JSON.parse(await readFile(variablesFile, 'utf8'));
      assert.deepEqual(written, world.request.variables);
    });

    it('refuses to overwrite a variables.json already in the scratch directory and starts nothing', async () => {
      const planted = join(world.request.scratchDir, 'variables.json');
      await writeFile(planted, '{"planted":true}\n');
      const { ports, processPort, probeCalls } = fakeRenderPorts({ probe: matchingProbe() });

      await assert.rejects(hyperframesRender(world.request, ports), (error: unknown) => error instanceof Error && 'code' in error && error.code === 'EEXIST');

      assert.equal(processPort.requests.length, 0);
      assert.equal(probeCalls.length, 0);
      assert.equal(await readFile(planted, 'utf8'), '{"planted":true}\n');
    });
  });

  describe('the picture check (AC 79)', () => {
    const refusals: { check: string; probe: PictureProbe }[] = [
      { check: 'codec', probe: matchingProbe({ codec: 'hevc' }) },
      { check: 'pixel-format', probe: matchingProbe({ pixelFormat: 'yuv444p' }) },
      { check: 'size', probe: matchingProbe({ width: 1920, height: 1080 }) },
      { check: 'fps', probe: matchingProbe({ fps: 25 }) },
      { check: 'duration', probe: matchingProbe({ durationS: NARRATION_S - 2 / FPS }) },
    ];

    for (const { check, probe } of refusals) {
      it(`refuses a picture failing the ${check} check and runs no narration mux`, async () => {
        const { ports, processPort, probeCalls } = fakeRenderPorts({ probe });

        const error = await rejectionOf(hyperframesRender(world.request, ports));

        assert.ok(error instanceof PictureCheckError, 'a mux that ran would reject with a plain ExternalToolError instead');
        assert.deepEqual([...error.checks], [check]);
        assert.equal(processPort.requests.length, 1);
        // AC 103: the picture probe runs runtime.ffprobeBin, never the tools.ffprobePath setting.
        assert.deepEqual(probeCalls, [{ ffprobePath: FFPROBE_FIXTURE, file: join(world.request.scratchDir, 'picture.mp4') }]);
        assert.equal(await exists(world.request.output), false);
      });
    }

    it('refuses an unreadable picture with the unreadable check', async () => {
      const { ports } = fakeRenderPorts({ probe: null });

      const error = await rejectionOf(hyperframesRender(world.request, ports));

      assert.ok(error instanceof PictureCheckError);
      assert.deepEqual([...error.checks], ['unreadable']);
      assert.equal(await exists(world.request.output), false);
    });

    it('lets a picture longer than the narration through the check to the narration mux', async () => {
      const { ports, probeCalls } = fakeRenderPorts({ probe: matchingProbe({ durationS: NARRATION_S + 4 }) });

      const error = await rejectionOf(hyperframesRender(world.request, ports));

      assert.ok(error instanceof ExternalToolError);
      assert.equal(error instanceof PictureCheckError, false);
      // AC 101: the mux runs the resolved runtime.ffmpegBin (a fixture path that does not exist), never tools.ffmpegPath.
      assert.equal(error.tool, world.request.runtime.ffmpegBin);
      assert.notEqual(error.tool, world.request.tools?.ffmpegPath);
      assert.equal(probeCalls.length, 1);
    });

    it('lets a picture exactly one frame shorter than the narration through the check', async () => {
      const { ports } = fakeRenderPorts({ probe: matchingProbe({ durationS: NARRATION_S - 1 / FPS }) });

      const error = await rejectionOf(hyperframesRender(world.request, ports));

      assert.ok(error instanceof ExternalToolError);
      assert.equal(error instanceof PictureCheckError, false);
    });

    it('throws render-failed and never probes the picture when the render exits non-zero', async () => {
      const { ports, probeCalls } = fakeRenderPorts({ probe: matchingProbe(), exitCodes: [2] });

      await assert.rejects(
        hyperframesRender(world.request, ports),
        (error: unknown) => error instanceof HyperframesProcessFailedError && error.reason === 'render-failed' && error.exitCode === 2,
      );

      assert.equal(probeCalls.length, 0);
      assert.equal(await exists(world.request.output), false);
    });
  });

  describe('failure messages (AC 81)', () => {
    const failures: { name: string; probe: PictureProbe | null; exitCodes: readonly number[] }[] = [
      { name: 'a picture refusal', probe: matchingProbe({ codec: 'vp9', durationS: 1 }), exitCodes: [] },
      { name: 'an unreadable picture', probe: null, exitCodes: [] },
      { name: 'a failed render', probe: matchingProbe(), exitCodes: [1] },
    ];

    for (const failure of failures) {
      it(`keeps variable values and staged paths out of ${failure.name}`, async () => {
        const { ports } = fakeRenderPorts({ probe: failure.probe, exitCodes: failure.exitCodes });

        const error = await rejectionOf(hyperframesRender(world.request, ports));

        assert.ok(error instanceof Error);
        const surfaces = [error.message, String(error), error.stack ?? '', JSON.stringify(error)];
        const forbidden = [SENTINEL_VALUE, SENTINEL_PATH, world.root, world.request.templateDir, world.request.scratchDir, world.request.runtime.binPath, '/fixture/'];
        for (const surface of surfaces) {
          for (const text of forbidden) assert.equal(surface.includes(text), false, `a failure surface carries ${text}`);
        }
      });
    }
  });
});
