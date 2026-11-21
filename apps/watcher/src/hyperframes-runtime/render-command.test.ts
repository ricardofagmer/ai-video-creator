import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { SANDBOX_EXEC_PATH, buildRenderArgv, buildRenderEnv, sandboxProfile } from '@studio/hyperframes';
import {
  PARENT_ENV_SENTINELS,
  RENDER_ENV_KEYS,
  assertNoParentSentinel,
  expectedRenderArgs,
  expectedRenderEnv,
  runtimeFixture,
  withParentEnv,
} from './hyperframes-runtime.fixtures.harness.test';

/*
 * The pure command builders of `@studio/hyperframes` (SPEC 0008 sections 4.4, 4.5 and 4.6;
 * AC 66, AC 67). Nothing here starts a process: `/usr/bin/sandbox-exec` is only compared as the
 * argv string the builder returns.
 */

const VARIABLES_FILE = '/fixture/scratch/render-0001/variables.json';
const PICTURE_FILE = '/fixture/scratch/render-0001/picture.mp4';

describe('buildRenderArgv (AC 66)', () => {
  it('runs the pinned bin with the runtime node under sandbox-exec with exactly the frozen render flags', () => {
    const runtime = runtimeFixture();

    const command = buildRenderArgv({ variablesFile: VARIABLES_FILE, output: PICTURE_FILE, runtime });

    assert.equal(command.command, '/usr/bin/sandbox-exec');
    assert.equal(SANDBOX_EXEC_PATH, '/usr/bin/sandbox-exec');
    assert.deepEqual([...command.args], expectedRenderArgs({ runtime, variablesFile: VARIABLES_FILE, output: PICTURE_FILE }));
  });

  it('keeps a path that contains spaces or looks like a flag as one positional argument', () => {
    const runtime = runtimeFixture({ ownerConfigDir: '/fixture/owner home/.hyperframes' });
    const output = '/fixture/scratch/a b/--no-strict.mp4';

    const command = buildRenderArgv({ variablesFile: VARIABLES_FILE, output, runtime });

    assert.equal(command.args.length, 15);
    assert.equal(command.args.at(-1), output);
    assert.equal(command.args[3], 'OWNER_HYPERFRAMES_DIR=/fixture/owner home/.hyperframes');
  });
});

describe('buildRenderEnv (AC 67)', () => {
  it('holds exactly the eleven keys of section 4.5 with their stated values', () => {
    const runtime = runtimeFixture();

    const env = buildRenderEnv(runtime);

    assert.deepEqual(Object.keys(env).sort(), RENDER_ENV_KEYS);
    assert.deepEqual({ ...env }, expectedRenderEnv(runtime));
  });

  it('carries none of the API keys or arbitrary variables set in the parent environment', async () => {
    const runtime = runtimeFixture();

    const env = await withParentEnv(PARENT_ENV_SENTINELS, () => buildRenderEnv(runtime));

    assert.deepEqual({ ...env }, expectedRenderEnv(runtime));
    assertNoParentSentinel(env, PARENT_ENV_SENTINELS);
  });

  it('never sets PRODUCER_RESTRICT_PAGE_NETWORK, even when the parent sets it', async () => {
    const env = await withParentEnv({ PRODUCER_RESTRICT_PAGE_NETWORK: '0' }, () => buildRenderEnv(runtimeFixture()));

    assert.equal(Object.hasOwn(env, 'PRODUCER_RESTRICT_PAGE_NETWORK'), false);
  });
});

describe('sandboxProfile (section 4.6)', () => {
  it('ships a profile that denies the network and the owner hyperframes folder', async () => {
    const text = await readFile(sandboxProfile().path, 'utf8');

    assert.match(text, /^\(deny network\*\)$/m);
    assert.match(text, /^\(deny file-read\* file-write\* \(subpath \(param "OWNER_HYPERFRAMES_DIR"\)\)\)$/m);
  });

  it('reports the sha-256 of the shipped profile bytes', async () => {
    const profile = sandboxProfile();

    const bytes = await readFile(profile.path);

    assert.match(profile.sha256, /^[0-9a-f]{64}$/);
    assert.equal(profile.sha256, createHash('sha256').update(bytes).digest('hex'));
  });
});
