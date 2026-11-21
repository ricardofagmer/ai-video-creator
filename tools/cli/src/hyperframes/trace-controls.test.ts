import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { SANDBOX_EXEC_PATH, type HyperframesProcessRequest, type HyperframesRuntime } from '@studio/hyperframes';
import { ScriptedProcessPort } from './hyperframes-cli.harness.test.js';
import { type SandboxDenial } from './hyperframes-ports.js';
import { isNetworkControlDenial, isProbedControlDenial, runTraceControls, type TraceControlTargets } from './trace-controls.js';

/*
 * The five trace controls (SPEC 0008 section 17.9, AC 93). The fake process port records each start
 * and answers scripted exit codes; its hook stands in for the child (C3 leaving a file behind).
 * Only a temp folder is written; nothing is started.
 */

const API_PORT = 4311;
/** Any `-f`/`-D` list: the controls pass it through untouched, whatever it holds. */
const SANDBOX_ARGS: readonly string[] = ['-f', '/profiles/render.sb', '-D', 'HF_ROOT=/data/hyperframes', '-D', 'STUDIO_API_PORT=4311'];
const NODE_PATH = '/opt/node/bin/node';
const START = { C1: 0, C2: 1, C3: 2, C4: 3, C5: 4 } as const;

interface ControlsWorld {
  root: string;
  runtime: HyperframesRuntime;
  remove(): Promise<void>;
}

function runtimeUnder(dataHomeRoot: string): HyperframesRuntime {
  const hyperframesRoot = join(dataHomeRoot, 'hyperframes');
  return {
    nodePath: NODE_PATH,
    binPath: '/opt/hyperframes/bin/hyperframes.js',
    configDir: join(hyperframesRoot, 'config'),
    cacheDir: join(hyperframesRoot, 'cache'),
    homeDir: join(hyperframesRoot, 'home'),
    tmpDir: join(dataHomeRoot, 'scratch'),
    path: '/usr/bin:/bin',
    browserPath: join(hyperframesRoot, 'cache', 'chrome', 'chrome-headless-shell'),
    sandboxProfilePath: '/profiles/render.sb',
    ownerConfigDir: '/owner/.hyperframes',
    ownerHomeDir: '/owner',
    studioRoot: '/studio',
    dataHomeRoot,
    hyperframesRoot,
    chromeDir: join(hyperframesRoot, 'cache', 'chrome'),
    ffmpegBin: '/opt/tools/ffmpeg',
    ffprobeBin: '/opt/tools/ffprobe',
    apiPort: API_PORT,
    webPort: 4310,
  };
}

async function createControlsWorld(): Promise<ControlsWorld> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'studio-cli-trace-controls-')));
  const runtime = runtimeUnder(join(root, 'data'));
  await mkdir(runtime.hyperframesRoot, { recursive: true });
  return { root, runtime, remove: () => rm(root, { recursive: true, force: true }) };
}

/** A hook that runs `action` at the given start only (0-based, see `START`). */
function atStart(startIndex: number, action: (request: HyperframesProcessRequest) => Promise<void>): (request: HyperframesProcessRequest) => Promise<void> {
  let started = 0;
  return async (request) => {
    const current = started;
    started += 1;
    if (current === startIndex) await action(request);
  };
}

/** Creates the file a C3 start aims at, as a C3 the sandbox did not refuse would; returns its path. */
async function createProbeFile(request: HyperframesProcessRequest): Promise<string> {
  const target = request.args.at(-1);
  assert.ok(target !== undefined);
  await writeFile(target, '');
  return target;
}

function targetsFor(runtime: HyperframesRuntime): TraceControlTargets {
  return { probeFile: join(runtime.hyperframesRoot, '.studio-trace-c3-fixed'), dataHomeRoot: runtime.dataHomeRoot, apiPort: runtime.apiPort };
}

function denial(operation: string, target: string): SandboxDenial {
  return { process: 'node', operation, target };
}

describe('runTraceControls (SPEC 0008 section 17.9, AC 93)', () => {
  let world: ControlsWorld;

  beforeEach(async () => {
    world = await createControlsWorld();
  });

  afterEach(async () => {
    await world.remove();
  });

  function request(): Parameters<typeof runTraceControls>[0] {
    return { sandboxArgs: SANDBOX_ARGS, runtime: world.runtime, cwd: world.root, env: { HOME: join(world.root, 'home') } };
  }

  it('starts five sandboxed node -e processes, each with exactly the given sandbox arguments before the node path', async () => {
    const processPort = new ScriptedProcessPort();

    await runTraceControls(request(), processPort);

    assert.equal(processPort.requests.length, 5);
    for (const start of processPort.requests) {
      assert.equal(start.command, SANDBOX_EXEC_PATH);
      assert.deepEqual(start.args.slice(0, SANDBOX_ARGS.length), SANDBOX_ARGS);
      assert.equal(start.args[SANDBOX_ARGS.length], NODE_PATH);
      assert.equal(start.args[SANDBOX_ARGS.length + 1], '-e');
    }
  });

  it('reports the exit code of each control under its own id, in the order C1 to C5', async () => {
    const processPort = new ScriptedProcessPort([0, 10, 12, 11, 10]);

    const outcome = await runTraceControls(request(), processPort);

    assert.deepEqual(outcome.exitCodes, { C1: 0, C2: 10, C3: 12, C4: 11, C5: 10 });
  });

  it('aims C1 at the TEST-NET address, C2 at /usr/bin/true, C3 directly under HF_ROOT, C4 at DATA_HOME and C5 at the api port', async () => {
    const processPort = new ScriptedProcessPort();

    const outcome = await runTraceControls(request(), processPort);

    const targetArgs = processPort.requests.map((start) => start.args.slice(SANDBOX_ARGS.length + 3));
    assert.deepEqual(targetArgs, [['192.0.2.1', '9'], ['/usr/bin/true'], [outcome.targets.probeFile], [world.runtime.dataHomeRoot], ['127.0.0.1', String(API_PORT)]]);
    assert.equal(dirname(outcome.targets.probeFile), world.runtime.hyperframesRoot);
    assert.equal(outcome.targets.dataHomeRoot, world.runtime.dataHomeRoot);
    assert.equal(outcome.targets.apiPort, API_PORT);
  });

  it('aims C3 at a new random name on every run', async () => {
    const first = await runTraceControls(request(), new ScriptedProcessPort());
    const second = await runTraceControls(request(), new ScriptedProcessPort());

    assert.notEqual(first.targets.probeFile, second.targets.probeFile);
  });

  it('removes a file left by C3 and reports the removal', async () => {
    const processPort = new ScriptedProcessPort(
      [0, 0, 10],
      atStart(START.C3, async (start) => {
        await createProbeFile(start);
      }),
    );

    const outcome = await runTraceControls(request(), processPort);

    assert.equal(outcome.probeFileRemoved, true);
    assert.equal(existsSync(outcome.targets.probeFile), false);
  });

  it('reports no removal when C3 left no file', async () => {
    const outcome = await runTraceControls(request(), new ScriptedProcessPort());

    assert.equal(outcome.probeFileRemoved, false);
  });

  it('removes a file left by C3 even when a later control start fails', async () => {
    const probeFile: { value: string | null } = { value: null };
    let started = 0;
    const processPort = new ScriptedProcessPort([], async (start) => {
      const current = started;
      started += 1;
      if (current === START.C3) probeFile.value = await createProbeFile(start);
      if (current === START.C4) throw new Error('C4 could not be started');
    });

    await assert.rejects(runTraceControls(request(), processPort), /C4 could not be started/);

    assert.ok(probeFile.value !== null, 'C3 was not started');
    assert.equal(existsSync(probeFile.value), false);
  });
});

describe('telling control denials apart in the system log (SPEC 0008 section 17.9 step 3)', () => {
  const runtime = runtimeUnder('/data');
  const targets = targetsFor(runtime);

  it('recognises the C1 network denial', () => {
    assert.equal(isNetworkControlDenial(denial('network-outbound', '192.0.2.1:9')), true);
  });

  it('does not take another network denial, or a file denial naming the C1 address, for C1', () => {
    assert.equal(isNetworkControlDenial(denial('network-outbound', '203.0.113.7:443')), false);
    assert.equal(isNetworkControlDenial(denial('file-read-data', '192.0.2.1:9')), false);
  });

  const causedByControls: readonly { control: string; entry: SandboxDenial }[] = [
    { control: 'C2', entry: denial('process-exec*', '/usr/bin/true') },
    { control: 'C3', entry: denial('file-write-create', targets.probeFile) },
    { control: 'C4', entry: denial('file-read-data', runtime.dataHomeRoot) },
    { control: 'C4 (trailing slash)', entry: denial('file-read-data', `${runtime.dataHomeRoot}/`) },
    { control: 'C5', entry: denial('network-outbound', `127.0.0.1:${API_PORT}`) },
    { control: 'C5 (localhost)', entry: denial('network-outbound', `localhost:${API_PORT}`) },
  ];
  for (const { control, entry } of causedByControls) {
    it(`attributes the ${control} denial to its control`, () => {
      assert.equal(isProbedControlDenial(entry, targets), true);
    });
  }

  const notCausedByControls: readonly { name: string; entry: SandboxDenial }[] = [
    { name: 'a loopback port that only starts with the api port', entry: denial('network-outbound', `127.0.0.1:${API_PORT}0`) },
    { name: 'another loopback port', entry: denial('network-outbound', '127.0.0.1:5432') },
    { name: 'another program started', entry: denial('process-exec*', '/bin/sh') },
    { name: 'a file inside the data home', entry: denial('file-read-data', `${runtime.dataHomeRoot}/studio.db`) },
    { name: 'another file under HF_ROOT', entry: denial('file-write-create', join(runtime.hyperframesRoot, 'engine.json')) },
    { name: 'a mach lookup', entry: denial('mach-lookup', 'com.example.unlisted-service') },
  ];
  for (const { name, entry } of notCausedByControls) {
    it(`does not attribute ${name} to a control`, () => {
      assert.equal(isProbedControlDenial(entry, targets), false);
    });
  }
});
