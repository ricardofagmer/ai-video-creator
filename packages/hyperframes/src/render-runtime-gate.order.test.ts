import assert from 'node:assert/strict';
import { mkdir, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { type HyperframesRefusalReason } from '@studio/shared/hyperframes';
import { writeEngineFile, writeTraceFile } from '@studio/shared/hyperframes/files';
import { HyperframesChromeMissingError } from './errors';
import {
  API_PORT,
  BOTH,
  WEB_PORT,
  answerOf,
  changeChromeBytes,
  chromeOutsideChromeFolder,
  createReadyDataHome,
  engineFile,
  fsError,
  pinMismatch,
  removeDataHome,
  testSystem,
  traceFile,
  withoutGateState,
  writeProgram,
  type Arranged,
  type Purpose,
  type TestDataHome,
} from './render-runtime-gate.harness.test';
import { completeRenderRuntime, type CheckedRenderRuntime } from './render-runtime-gate';
import { type RenderRuntimeSystem } from './render-runtime-system';

/*
 * The render runtime gate when two faults coexist (the earlier check wins), when the sandbox
 * profile cannot be read, and the completion step in the starting process
 * (docs/specs/2026-11-25-render-runtime-gate-design.md decisions 6 and 9).
 */

describe('checkRenderRuntime: an unreadable sandbox profile', () => {
  let home: TestDataHome | undefined;
  const unreadableProfile = (): { path: string; sha256: string } => {
    throw fsError('ENOENT');
  };

  beforeEach(async () => {
    home = await createReadyDataHome();
  });

  afterEach(async () => {
    await removeDataHome(home);
    home = undefined;
  });

  it('answers sandbox-unavailable for a render that would otherwise be ready', async () => {
    assert.ok(home !== undefined);

    assert.deepEqual(await answerOf(home, 'render', { system: { sandboxProfile: unreadableProfile } }), { status: 'refused', reason: 'sandbox-unavailable' });
  });

  it('still answers engine-disabled for a disabled engine, since the gate files answer first (AC 70)', async () => {
    assert.ok(home !== undefined);
    await writeEngineFile(home.dataHomeRoot, engineFile('disabled'));

    assert.deepEqual(await answerOf(home, 'render', { system: { sandboxProfile: unreadableProfile } }), { status: 'refused', reason: 'engine-disabled' });
  });

  it('still answers trace-missing when no trace was recorded', async () => {
    assert.ok(home !== undefined);
    await rm(home.paths.traceFile);

    assert.deepEqual(await answerOf(home, 'render', { system: { sandboxProfile: unreadableProfile } }), { status: 'refused', reason: 'trace-missing' });
  });

  it('answers sandbox-unavailable, not trace-stale, when only the profile hash could decide staleness', async () => {
    assert.ok(home !== undefined);
    await writeTraceFile(home.dataHomeRoot, traceFile({ profileSha256: 'a'.repeat(64) }));

    assert.deepEqual(await answerOf(home, 'render', { system: { sandboxProfile: unreadableProfile } }), { status: 'refused', reason: 'sandbox-unavailable' });
  });

  it('answers sandbox-unavailable for a trace even with a disabled engine', async () => {
    assert.ok(home !== undefined);
    await withoutGateState(home);

    assert.deepEqual(await answerOf(home, 'trace', { system: { sandboxProfile: unreadableProfile } }), { status: 'refused', reason: 'sandbox-unavailable' });
  });

  it('still answers chrome-missing for a trace when chrome.json is absent', async () => {
    assert.ok(home !== undefined);
    await withoutGateState(home);
    await rm(home.paths.chromeFile);

    assert.deepEqual(await answerOf(home, 'trace', { system: { sandboxProfile: unreadableProfile } }), { status: 'refused', reason: 'chrome-missing' });
  });

  it('throws a profile failure that is not a file system error', async () => {
    assert.ok(home !== undefined);
    const broken = (): { path: string; sha256: string } => {
      throw new Error('unexpected');
    };

    await assert.rejects(answerOf(home, 'render', { system: { sandboxProfile: broken } }), /unexpected/);
  });
});

/** Two faults at once: the one the earlier check finds is the answer. */
interface OrderCase {
  name: string;
  answers: Readonly<Record<Purpose, HyperframesRefusalReason>>;
  arrange: (home: TestDataHome) => Promise<Arranged | void>;
}

const ORDER: readonly OrderCase[] = [
  {
    name: 'a disabled engine and a pin mismatch',
    answers: { render: 'engine-disabled', trace: 'pin-mismatch' },
    arrange: async (home) => {
      await writeEngineFile(home.dataHomeRoot, engineFile('disabled'));
      return { system: { pinnedBinPath: pinMismatch } };
    },
  },
  {
    name: 'a disabled engine and an absent chrome.json',
    answers: { render: 'engine-disabled', trace: 'chrome-missing' },
    arrange: async (home) => {
      await writeEngineFile(home.dataHomeRoot, engineFile('disabled'));
      await rm(home.paths.chromeFile);
    },
  },
  {
    name: 'a missing trace and an unseeded config/',
    answers: { render: 'runtime-not-prepared', trace: 'runtime-not-prepared' },
    arrange: async (home) => {
      await rm(home.paths.traceFile);
      await rm(home.paths.configFile);
    },
  },
  {
    name: 'a stale trace and a pin mismatch',
    answers: { render: 'trace-stale', trace: 'pin-mismatch' },
    arrange: async (home) => {
      await writeTraceFile(home.dataHomeRoot, traceFile({ profileSha256: 'a'.repeat(64) }));
      return { system: { pinnedBinPath: pinMismatch } };
    },
  },
  {
    name: 'a missing home/ and a changed Chrome binary',
    answers: { render: 'runtime-not-prepared', trace: 'runtime-not-prepared' },
    arrange: async (home) => {
      await rm(home.paths.homeDir, { recursive: true });
      await changeChromeBytes(home);
    },
  },
  {
    name: 'a missing home/ and a Chrome verification that always refuses',
    answers: { render: 'runtime-not-prepared', trace: 'runtime-not-prepared' },
    arrange: async (home) => {
      await rm(home.paths.homeDir, { recursive: true });
      return {
        system: {
          verifyChromeBinary: () => Promise.reject(new HyperframesChromeMissingError('changed')),
        },
      };
    },
  },
  {
    name: 'a changed Chrome binary and a pin mismatch',
    answers: { render: 'chrome-missing', trace: 'chrome-missing' },
    arrange: async (home) => {
      await changeChromeBytes(home);
      return { system: { pinnedBinPath: pinMismatch } };
    },
  },
  {
    name: 'a pin mismatch and no sandbox-exec',
    answers: { render: 'pin-mismatch', trace: 'pin-mismatch' },
    arrange: async () => ({ system: { pinnedBinPath: pinMismatch, sandboxExecExists: () => false } }),
  },
  {
    name: 'no sandbox-exec and a browser outside cache/chrome',
    answers: { render: 'sandbox-unavailable', trace: 'sandbox-unavailable' },
    arrange: async (home) => {
      await chromeOutsideChromeFolder(home);
      return { system: { sandboxExecExists: () => false } };
    },
  },
  {
    name: 'a browser outside cache/chrome and an unresolvable ffmpeg',
    answers: { render: 'chrome-missing', trace: 'chrome-missing' },
    arrange: async (home) => {
      await chromeOutsideChromeFolder(home);
      return { request: { ffmpeg: 'no-such-ffmpeg' } };
    },
  },
  {
    name: 'a browser outside cache/chrome and a port out of range',
    answers: { render: 'chrome-missing', trace: 'chrome-missing' },
    arrange: async (home) => {
      await chromeOutsideChromeFolder(home);
      return { request: { studioPorts: { api: 80, web: WEB_PORT } } };
    },
  },
];

for (const purpose of BOTH) {
  describe(`checkRenderRuntime, purpose ${purpose}: the earlier check wins`, () => {
    let home: TestDataHome | undefined;

    beforeEach(async () => {
      home = await createReadyDataHome();
    });

    afterEach(async () => {
      await removeDataHome(home);
      home = undefined;
    });

    for (const order of ORDER) {
      it(`answers ${order.answers[purpose]} for ${order.name}`, async () => {
        assert.ok(home !== undefined);
        const arranged = await order.arrange(home);

        assert.deepEqual(await answerOf(home, purpose, arranged), { status: 'refused', reason: order.answers[purpose] });
      });
    }

    it('asks the machine nothing past the first refusal', async () => {
      assert.ok(home !== undefined);
      const asked: string[] = [];
      const system: Partial<RenderRuntimeSystem> = {
        pinnedBinPath: () => {
          asked.push('pinnedBinPath');
          return pinMismatch();
        },
        sandboxExecExists: () => {
          asked.push('sandboxExecExists');
          return true;
        },
        resolveExecutable: (name) => {
          asked.push(`resolveExecutable:${name}`);
          return Promise.resolve(name);
        },
      };

      assert.deepEqual(await answerOf(home, purpose, { system }), { status: 'refused', reason: 'pin-mismatch' });
      assert.deepEqual(asked, ['pinnedBinPath']);
    });

    it('resolves both media programs before it judges the ports', async () => {
      assert.ok(home !== undefined);
      const resolved: string[] = [];
      const { resolveExecutable } = testSystem();
      const system: Partial<RenderRuntimeSystem> = {
        resolveExecutable: (name, searchPath) => {
          resolved.push(name);
          return resolveExecutable(name, searchPath);
        },
      };

      const answer = await answerOf(home, purpose, { system, request: { studioPorts: { api: API_PORT, web: 0 } } });

      assert.deepEqual(answer, { status: 'refused', reason: 'sandbox-unavailable' });
      assert.deepEqual(resolved.sort(), ['ffmpeg', 'ffprobe']);
    });
  });
}

describe('completeRenderRuntime', () => {
  let home: TestDataHome | undefined;
  let checked: CheckedRenderRuntime;

  beforeEach(async () => {
    home = await createReadyDataHome();
    const answer = await answerOf(home, 'render', undefined);
    assert.ok(answer.status === 'ready');
    checked = answer.runtime;
  });

  afterEach(async () => {
    await removeDataHome(home);
    home = undefined;
  });

  it('adds nodePath and tmpDir as real paths and the child PATH as given', async () => {
    assert.ok(home !== undefined);
    const node = join(home.root, 'runner', 'bin', 'node');
    await writeProgram(node);
    const tmp = join(home.root, 'scratch', 'start-0001');
    await mkdir(tmp, { recursive: true });
    const links = join(home.root, 'start-links');
    await mkdir(links);
    await symlink(node, join(links, 'node'));
    await symlink(tmp, join(links, 'tmp'));

    const answer = await completeRenderRuntime(checked, { nodePath: join(links, 'node'), tmpDir: join(links, 'tmp'), path: '/usr/bin:/bin' });

    assert.deepEqual(answer, { status: 'ready', runtime: { ...checked, nodePath: node, tmpDir: tmp, path: '/usr/bin:/bin' } });
  });

  it('refuses with sandbox-unavailable when the node binary cannot be resolved', async () => {
    assert.ok(home !== undefined);
    const tmp = join(home.root, 'scratch');
    await mkdir(tmp);

    const answer = await completeRenderRuntime(checked, { nodePath: join(home.root, 'no-such-node'), tmpDir: tmp, path: '/usr/bin' });

    assert.deepEqual(answer, { status: 'refused', reason: 'sandbox-unavailable' });
  });

  it('refuses with sandbox-unavailable when the scratch folder cannot be resolved', async () => {
    assert.ok(home !== undefined);
    const node = join(home.root, 'node');
    await writeProgram(node);

    const answer = await completeRenderRuntime(checked, { nodePath: node, tmpDir: join(home.root, 'no-such-scratch'), path: '/usr/bin' });

    assert.deepEqual(answer, { status: 'refused', reason: 'sandbox-unavailable' });
  });
});
