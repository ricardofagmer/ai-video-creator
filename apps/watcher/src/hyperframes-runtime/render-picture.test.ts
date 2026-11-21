import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { describe, it } from 'node:test';
import {
  FakeHyperframesProcessPort,
  HyperframesProcessFailedError,
  HyperframesSandboxUnavailableError,
  buildRenderArgv,
  pinnedBinPath,
  renderPicture,
  type RenderPictureRequest,
} from '@studio/hyperframes';
import { HYPERFRAMES_PIN } from '@studio/shared/hyperframes';
import {
  PARENT_ENV_SENTINELS,
  assertNoParentSentinel,
  expectedRenderArgs,
  expectedRenderEnv,
  runtimeFixture,
  withParentEnv,
} from './hyperframes-runtime.fixtures.harness.test';

/*
 * `renderPicture` and `pinnedBinPath` of `@studio/hyperframes` (SPEC 0008 sections 4.4 and 5.2;
 * AC 66, AC 67, AC 68). Every start goes to `FakeHyperframesProcessPort`; the sandbox check is
 * answered by the test, so no file under `/usr/bin` is consulted and no process starts.
 */

/** `apps/watcher/src/hyperframes-runtime` is four levels below the monorepo root. */
const WORKSPACE_ROOT = resolve(__dirname, '..', '..', '..', '..');

function renderRequest(): RenderPictureRequest {
  return {
    templateDir: '/fixture/scratch/render-0001/staged-template',
    variablesFile: '/fixture/scratch/render-0001/variables.json',
    output: '/fixture/scratch/render-0001/picture.mp4',
    runtime: runtimeFixture(),
  };
}

const sandboxPresent = (): boolean => true;
const sandboxMissing = (): boolean => false;

describe('renderPicture (AC 66, AC 67)', () => {
  it('starts one sandboxed render with the frozen argv, the closed environment and the staged copy as cwd', async () => {
    const request = renderRequest();
    const processPort = new FakeHyperframesProcessPort();

    await withParentEnv(PARENT_ENV_SENTINELS, () => renderPicture(request, { process: processPort, sandboxExecExists: sandboxPresent }));

    assert.equal(processPort.requests.length, 1);
    const [start] = processPort.requests;
    assert.ok(start !== undefined);
    assert.equal(start.command, '/usr/bin/sandbox-exec');
    assert.deepEqual([...start.args], expectedRenderArgs({ runtime: request.runtime, variablesFile: request.variablesFile, output: request.output }));
    assert.equal(start.cwd, request.templateDir);
    assert.deepEqual({ ...start.env }, expectedRenderEnv(request.runtime));
    assertNoParentSentinel(start.env, PARENT_ENV_SENTINELS);
  });

  it('reports the render time in seconds from the monotonic clock', async (t) => {
    const readings = [1_000, 3_500];
    t.mock.method(performance, 'now', (): number => readings.shift() ?? 3_500);

    const result = await renderPicture(renderRequest(), { process: new FakeHyperframesProcessPort([0]), sandboxExecExists: sandboxPresent });

    assert.deepEqual(result, { renderSeconds: 2.5 });
  });

  it('throws render-failed with the exit code when the render exits non-zero', async () => {
    const processPort = new FakeHyperframesProcessPort([3]);

    await assert.rejects(
      renderPicture(renderRequest(), { process: processPort, sandboxExecExists: sandboxPresent }),
      (error: unknown) => error instanceof HyperframesProcessFailedError && error.reason === 'render-failed' && error.exitCode === 3,
    );
    assert.equal(processPort.requests.length, 1);
  });

  it('keeps every path of the request out of the render failure message (AC 81)', async () => {
    const request = renderRequest();

    const error = await renderPicture(request, { process: new FakeHyperframesProcessPort([1]), sandboxExecExists: sandboxPresent }).then(
      () => assert.fail('the render was expected to fail'),
      (failure: unknown) => failure,
    );

    assert.ok(error instanceof HyperframesProcessFailedError);
    for (const path of [request.templateDir, request.variablesFile, request.output, request.runtime.binPath, '/fixture/']) {
      assert.equal(error.message.includes(path), false, `the message names ${path}`);
    }
  });

  it('refuses with sandbox-unavailable and starts nothing when sandbox-exec is missing', async () => {
    const processPort = new FakeHyperframesProcessPort();

    await assert.rejects(
      renderPicture(renderRequest(), { process: processPort, sandboxExecExists: sandboxMissing }),
      (error: unknown) => error instanceof HyperframesSandboxUnavailableError && error.reason === 'sandbox-unavailable',
    );
    assert.equal(processPort.requests.length, 0);
  });
});

describe('pinnedBinPath (AC 66, AC 68)', () => {
  /*
   * `pinnedBinPath()` takes no root: it resolves `<packages/hyperframes>/node_modules/hyperframes`
   * from its own location, so these read the real workspace install (read-only, no start). The
   * other-version refusal cannot be reached on a temporary fixture; see the test-writer report.
   */

  it('returns the real path of bin/hyperframes.mjs of the installed 0.9.72 package inside the workspace node_modules', () => {
    const binPath = pinnedBinPath();

    assert.equal(binPath, realpathSync(binPath));
    assert.ok(binPath.endsWith(join('hyperframes', 'bin', 'hyperframes.mjs')));
    assert.ok(binPath.startsWith(`${realpathSync(join(WORKSPACE_ROOT, 'node_modules'))}${sep}`));
    const manifest: unknown = JSON.parse(readFileSync(join(dirname(dirname(binPath)), 'package.json'), 'utf8'));
    assert.ok(typeof manifest === 'object' && manifest !== null);
    assert.equal(Reflect.get(manifest, 'name'), 'hyperframes');
    assert.equal(Reflect.get(manifest, 'version'), HYPERFRAMES_PIN);
    assert.equal(HYPERFRAMES_PIN, '0.9.72');
  });

  it('gives a render argv that starts the pinned bin by its absolute real path, never by name from PATH', () => {
    const runtime = runtimeFixture({ binPath: pinnedBinPath() });

    const { command, args } = buildRenderArgv({ variablesFile: '/fixture/variables.json', output: '/fixture/picture.mp4', runtime });

    assert.equal(command, '/usr/bin/sandbox-exec');
    assert.ok(!args.includes('hyperframes'));
    assert.ok(!args.includes('npx'));
    const bin = args[5];
    assert.ok(bin !== undefined && isAbsolute(bin));
    assert.equal(bin, realpathSync(bin));
    assert.equal(args[4], runtime.nodePath);
  });
});

describe('FakeHyperframesProcessPort (SPEC 0008 K11)', () => {
  it('answers the scripted exit codes in order, then 0, and records a copy of each request', async () => {
    const port = new FakeHyperframesProcessPort([7, 2]);
    const args = ['render'];

    const answers: { exitCode: number }[] = [];
    for (let start = 0; start < 3; start += 1) answers.push(await port.run({ command: '/fixture/command', args, cwd: '/fixture/cwd', env: {} }));
    args.push('--mutated-after-start');

    assert.deepEqual(answers, [{ exitCode: 7 }, { exitCode: 2 }, { exitCode: 0 }]);
    assert.equal(port.requests.length, 3);
    assert.deepEqual([...(port.requests[0]?.args ?? [])], ['render']);
  });
});
