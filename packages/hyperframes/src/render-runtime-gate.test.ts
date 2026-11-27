import assert from 'node:assert/strict';
import { chmod, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { type HyperframesRefusalReason } from '@studio/shared/hyperframes';
import { writeEngineFile, writeTraceFile } from '@studio/shared/hyperframes/files';
import {
  API_PORT,
  BOTH,
  WEB_PORT,
  answerOf,
  changeChromeBytes,
  chromeOutsideChromeFolder,
  createReadyDataHome,
  engineFile,
  expectedRuntime,
  linkOutside,
  pinMismatch,
  removeDataHome,
  traceFile,
  withoutGateState,
  writeProgram,
  type Arranged,
  type Purpose,
  type TestDataHome,
} from './render-runtime-gate.harness.test';

/*
 * The render runtime gate at its interface (docs/specs/2026-11-25-render-runtime-gate-design.md
 * decisions 5, 7 and 9): every refusal once per purpose, in the check order of the Shape section,
 * each on a temporary data home where every earlier check passes. For purpose `trace` the data home
 * additionally has a disabled engine and no `trace.json`, so every trace answer also proves the
 * gate-file state is skipped (decision 7). Coexisting faults, the sandbox profile and the completion
 * step are in `render-runtime-gate.order.test.ts`.
 */

interface RefusalCase {
  name: string;
  reason: HyperframesRefusalReason;
  purposes: readonly Purpose[];
  arrange: (home: TestDataHome) => Promise<Arranged | void>;
}

const RENDER_ONLY: readonly Purpose[] = ['render'];

const REFUSALS: readonly RefusalCase[] = [
  // 1. Gate files and engine state (purpose render only).
  {
    name: 'engine.json says disabled',
    reason: 'engine-disabled',
    purposes: RENDER_ONLY,
    arrange: async (home) => writeEngineFile(home.dataHomeRoot, engineFile('disabled')),
  },
  { name: 'engine.json is absent', reason: 'engine-disabled', purposes: RENDER_ONLY, arrange: async (home) => rm(home.paths.engineFile) },
  { name: 'trace.json is absent', reason: 'trace-missing', purposes: RENDER_ONLY, arrange: async (home) => rm(home.paths.traceFile) },
  {
    name: 'the trace recorded another sandbox profile',
    reason: 'trace-stale',
    purposes: RENDER_ONLY,
    arrange: async (home) => writeTraceFile(home.dataHomeRoot, traceFile({ profileSha256: 'a'.repeat(64) })),
  },
  {
    name: 'the trace recorded another Chrome hash',
    reason: 'trace-stale',
    purposes: RENDER_ONLY,
    arrange: async (home) => writeTraceFile(home.dataHomeRoot, traceFile({ chromeSha256: 'f'.repeat(64) })),
  },
  {
    name: 'the trace recorded another pin',
    reason: 'trace-stale',
    purposes: RENDER_ONLY,
    arrange: async (home) => writeTraceFile(home.dataHomeRoot, traceFile({ pin: '0.9.71' })),
  },
  {
    name: 'the trace failed',
    reason: 'trace-stale',
    purposes: RENDER_ONLY,
    arrange: async (home) => writeTraceFile(home.dataHomeRoot, traceFile({ result: 'fail' })),
  },
  // 2. chrome.json present (and the binary it names, read with the gate files).
  { name: 'chrome.json is absent', reason: 'chrome-missing', purposes: BOTH, arrange: async (home) => rm(home.paths.chromeFile) },
  { name: 'the binary chrome.json names is absent', reason: 'chrome-missing', purposes: BOTH, arrange: async (home) => rm(home.browserPath) },
  {
    // A missing cache/ takes the recorded binary with it, so the gate files already answer.
    name: 'cache/ is absent, and with it the binary',
    reason: 'chrome-missing',
    purposes: BOTH,
    arrange: async (home) => rm(home.paths.cacheDir, { recursive: true }),
  },
  // 3. config/, cache/ and home/ as real folders.
  { name: 'config/config.json is not seeded', reason: 'runtime-not-prepared', purposes: BOTH, arrange: async (home) => rm(home.paths.configFile) },
  {
    name: 'config/ is absent',
    reason: 'runtime-not-prepared',
    purposes: BOTH,
    arrange: async (home) => rm(home.paths.configDir, { recursive: true }),
  },
  { name: 'home/ is absent', reason: 'runtime-not-prepared', purposes: BOTH, arrange: async (home) => rm(home.paths.homeDir, { recursive: true }) },
  {
    name: 'home/ is a file',
    reason: 'runtime-not-prepared',
    purposes: BOTH,
    arrange: async (home) => {
      await rm(home.paths.homeDir, { recursive: true });
      await writeFile(home.paths.homeDir, '');
    },
  },
  {
    name: 'home/ is a dangling link',
    reason: 'runtime-not-prepared',
    purposes: BOTH,
    arrange: async (home) => {
      await rm(home.paths.homeDir, { recursive: true });
      await symlink(join(home.root, 'no-such-home'), home.paths.homeDir);
    },
  },
  // 4. Chrome binary unchanged.
  { name: 'the Chrome binary bytes changed', reason: 'chrome-missing', purposes: BOTH, arrange: changeChromeBytes },
  {
    name: 'the Chrome binary grew',
    reason: 'chrome-missing',
    purposes: BOTH,
    arrange: async (home) => writeFile(home.browserPath, 'fake chrome-headless-shell binary\nplus more\n'),
  },
  {
    name: 'cache/chrome is a link to a folder outside cache/',
    reason: 'chrome-missing',
    purposes: BOTH,
    arrange: async (home) => {
      await linkOutside(home, join(home.paths.cacheDir, 'chrome'), 'outside-chrome');
    },
  },
  // 5. Pin, then sandbox-exec.
  { name: 'the installed package is not the pin', reason: 'pin-mismatch', purposes: BOTH, arrange: async () => ({ system: { pinnedBinPath: pinMismatch } }) },
  {
    name: '/usr/bin/sandbox-exec is absent',
    reason: 'sandbox-unavailable',
    purposes: BOTH,
    arrange: async () => ({ system: { sandboxExecExists: () => false } }),
  },
  // 6. Chrome folder and browser real paths.
  { name: 'the browser sits in cache/ but outside cache/chrome', reason: 'chrome-missing', purposes: BOTH, arrange: chromeOutsideChromeFolder },
  // 7. Every sandbox parameter as a real path.
  { name: 'ffmpeg is not on the child PATH', reason: 'sandbox-unavailable', purposes: BOTH, arrange: async () => ({ request: { ffmpeg: 'no-such-ffmpeg' } }) },
  {
    name: 'ffprobe is given as a relative path',
    reason: 'sandbox-unavailable',
    purposes: BOTH,
    arrange: async () => ({ request: { ffprobe: 'bin/ffprobe' } }),
  },
  {
    name: 'ffprobe is given as an absolute path that is not executable',
    reason: 'sandbox-unavailable',
    purposes: BOTH,
    arrange: async (home) => {
      await chmod(join(home.binDir, 'ffprobe'), 0o644);
      return { request: { ffprobe: join(home.binDir, 'ffprobe') } };
    },
  },
  {
    name: 'the child PATH holds only a relative folder',
    reason: 'sandbox-unavailable',
    purposes: BOTH,
    arrange: async () => ({ request: { searchPath: 'bin' } }),
  },
  {
    name: 'the owner home does not exist',
    reason: 'sandbox-unavailable',
    purposes: BOTH,
    arrange: async (home) => ({ request: { ownerHome: join(home.root, 'no-such-owner') } }),
  },
  {
    name: 'the studio root does not exist',
    reason: 'sandbox-unavailable',
    purposes: BOTH,
    arrange: async (home) => ({ request: { studioRoot: join(home.root, 'no-such-studio') } }),
  },
  // 8. ffmpeg and ffprobe outside every folder the sandbox writes.
  {
    name: 'ffmpeg sits inside the data home',
    reason: 'sandbox-unavailable',
    purposes: BOTH,
    arrange: async (home) => {
      const ffmpeg = join(home.realDataHomeRoot, 'tools', 'ffmpeg');
      await writeProgram(ffmpeg);
      return { request: { ffmpeg } };
    },
  },
  {
    name: 'ffprobe is found on a PATH folder inside the data home',
    reason: 'sandbox-unavailable',
    purposes: BOTH,
    arrange: async (home) => {
      const tools = join(home.dataHomeRoot, 'tools');
      await writeProgram(join(tools, 'ffprobe'));
      return { request: { searchPath: tools, ffmpeg: join(home.binDir, 'ffmpeg') } };
    },
  },
  ...(['config', 'cache', 'home'] as const).map(
    (folder): RefusalCase => ({
      name: `ffprobe sits in ${folder}/, which is a link to a folder outside the data home`,
      reason: 'sandbox-unavailable',
      purposes: BOTH,
      arrange: async (home) => {
        const target = await linkOutside(home, join(home.paths.root, folder), `outside-${folder}`);
        const ffprobe = join(target, 'ffprobe');
        await writeProgram(ffprobe);
        return { request: { ffprobe } };
      },
    }),
  ),
  // 9. Studio ports in range.
  {
    name: 'the api port is below 1024',
    reason: 'sandbox-unavailable',
    purposes: BOTH,
    arrange: async () => ({ request: { studioPorts: { api: 1023, web: WEB_PORT } } }),
  },
  {
    name: 'the web port is above 65535',
    reason: 'sandbox-unavailable',
    purposes: BOTH,
    arrange: async () => ({ request: { studioPorts: { api: API_PORT, web: 65536 } } }),
  },
  {
    name: 'the api port is not an integer',
    reason: 'sandbox-unavailable',
    purposes: BOTH,
    arrange: async () => ({ request: { studioPorts: { api: 4310.5, web: WEB_PORT } } }),
  },
];

for (const purpose of BOTH) {
  describe(`checkRenderRuntime, purpose ${purpose}: one refusal per check, in order`, () => {
    let home: TestDataHome | undefined;

    beforeEach(async () => {
      home = await createReadyDataHome();
      if (purpose === 'trace') await withoutGateState(home);
    });

    afterEach(async () => {
      await removeDataHome(home);
      home = undefined;
    });

    function readyHome(): TestDataHome {
      assert.ok(home !== undefined);
      return home;
    }

    it('answers ready on the untouched data home, with every path real', async () => {
      const ready = readyHome();

      assert.deepEqual(await answerOf(ready, purpose, undefined), { status: 'ready', runtime: expectedRuntime(ready) });
    });

    for (const refusal of REFUSALS.filter((candidate) => candidate.purposes.includes(purpose))) {
      it(`answers ${refusal.reason} when ${refusal.name}`, async () => {
        const ready = readyHome();
        const arranged = await refusal.arrange(ready);

        assert.deepEqual(await answerOf(ready, purpose, arranged), { status: 'refused', reason: refusal.reason });
      });
    }

    for (const ports of [
      { api: 1024, web: 65535 },
      { api: 65535, web: 1024 },
    ]) {
      it(`accepts the port bounds api ${ports.api}, web ${ports.web}`, async () => {
        const ready = readyHome();

        assert.deepEqual(await answerOf(ready, purpose, { request: { studioPorts: ports } }), {
          status: 'ready',
          runtime: expectedRuntime(ready, { apiPort: ports.api, webPort: ports.web }),
        });
      });
    }
  });
}

describe('checkRenderRuntime: real paths of a ready answer', () => {
  let home: TestDataHome | undefined;

  beforeEach(async () => {
    home = await createReadyDataHome();
  });

  afterEach(async () => {
    await removeDataHome(home);
    home = undefined;
  });

  it('resolves absolute media program paths given through links to their real targets', async () => {
    assert.ok(home !== undefined);
    const links = join(home.root, 'program-links');
    await mkdir(links);
    await symlink(join(home.binDir, 'ffmpeg'), join(links, 'ffmpeg'));
    await symlink(join(home.binDir, 'ffprobe'), join(links, 'ffprobe'));

    const answer = await answerOf(home, 'render', { request: { ffmpeg: join(links, 'ffmpeg'), ffprobe: join(links, 'ffprobe') } });

    assert.deepEqual(answer, { status: 'ready', runtime: expectedRuntime(home) });
  });

  it('resolves config/, cache/ and home/ through links outside the data home, and Chrome inside the real cache', async () => {
    assert.ok(home !== undefined);
    const config = await linkOutside(home, home.paths.configDir, 'outside-config');
    const cache = await linkOutside(home, home.paths.cacheDir, 'outside-cache');
    const homeDir = await linkOutside(home, home.paths.homeDir, 'outside-home');

    const answer = await answerOf(home, 'render', undefined);

    assert.deepEqual(answer, {
      status: 'ready',
      runtime: expectedRuntime(home, {
        configDir: config,
        cacheDir: cache,
        homeDir,
        chromeDir: join(cache, 'chrome'),
        browserPath: join(cache, 'chrome', 'headless-shell'),
      }),
    });
  });

  it('names the owner config folder under the real owner home without it existing', async () => {
    assert.ok(home !== undefined);
    const answer = await answerOf(home, 'render', undefined);

    assert.ok(answer.status === 'ready');
    assert.equal(answer.runtime.ownerConfigDir, join(await realpath(home.ownerHome), '.hyperframes'));
  });
});
