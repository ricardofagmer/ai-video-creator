import assert from 'node:assert/strict';
import { access, open, readFile, writeFile, type FileHandle } from 'node:fs/promises';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { accountFilePath } from '@studio/shared/platforms/files';
import { newUlid } from '@studio/shared/run-files';
import { corruptHealthFilePath } from './health-file.set-aside';
import { DAY_MS, connectAccount } from './platform-fixtures.harness.test';
import { createPlatformHarness, type PlatformHarness } from './platform-step.harness.test';

/*
 * Round 4 nit (finding R7): once the rename of an unreadable `health.json` landed, the recovery is
 * done. A chmod failure after it leaves the mode as it is and is logged as
 * `platform.health-set-aside-mode-unchanged`, never as `platform.health-set-aside-failed`.
 */

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
 * Makes every `FileHandle.chmod` fail with EPERM: the prototype is taken from a real handle, since
 * Node does not export the class. Restored by `mock.restoreAll`.
 */
async function failEveryHandleChmod(probePath: string): Promise<void> {
  const probe = await open(probePath, 'r');
  const fileHandlePrototype: FileHandle = Object.getPrototypeOf(probe);
  await probe.close();
  mock.method(fileHandlePrototype, 'chmod', async (): Promise<void> => {
    throw Object.assign(new Error('chmod: EPERM'), { code: 'EPERM' });
  });
}

describe('Setting an unreadable health.json aside when only the chmod fails (round 4 nit)', () => {
  let harness: PlatformHarness;
  let connectionId: string;

  beforeEach(async () => {
    harness = await createPlatformHarness();
    connectionId = newUlid(harness.clock.now().getTime() - DAY_MS);
    await connectAccount(harness.platformRoot, { platform: 'youtube', connectionId, at: harness.clock.now(), mode: 'mock' });
  });

  afterEach(async () => {
    mock.restoreAll();
    await harness.close();
  });

  it('keeps the move, logs no set-aside-failed, logs the mode as unchanged, and the next call proceeds', async () => {
    const healthPath = accountFilePath(harness.platformRoot, 'youtube', 'health');
    await writeFile(healthPath, '{"token":', { mode: 0o644 });
    await failEveryHandleChmod(healthPath);

    const blockedCall = await harness.tokens.acquire('youtube', connectionId);

    assert.deepEqual(blockedCall, { status: 'blocked', reasonId: 'health-unknown' });
    assert.equal(await exists(healthPath), false, 'the rename landed');
    assert.equal(await readFile(corruptHealthFilePath(harness.platformRoot, 'youtube'), 'utf8'), '{"token":');
    assert.deepEqual(harness.events.ofType('platform.health-set-aside-failed'), []);
    assert.deepEqual(harness.events.ofType('platform.health-set-aside-mode-unchanged'), [
      { type: 'platform.health-set-aside-mode-unchanged', platform: 'youtube', error: 'Error' },
    ]);
    mock.restoreAll();

    const nextCall = await harness.tokens.acquire('youtube', connectionId);

    assert.equal(nextCall.status, 'ready');
    assert.equal(harness.events.ofType('platform.health-unreadable').length, 1);
  });
});
