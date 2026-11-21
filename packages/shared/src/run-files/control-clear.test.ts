import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { type ControlRequest } from '../run-format/control';
import { readControlRequest, removeControlRequestIfUnchanged, writeControlRequest } from './run-state-files';

/*
 * Lost pause (baseline review): the watcher reads control.json when an execution starts and clears
 * it. Only the request it read may be cleared; a pause the api wrote in between must survive.
 */

const AT_MS = 1_763_600_000_000;
const resumeRequest: ControlRequest = { pause: false, stop: false, at: AT_MS, resume: true };
const pauseRequest: ControlRequest = { pause: true, stop: false, at: AT_MS + 1, correlationId: 'pause-1' };

let runDir: string;

beforeEach(async () => {
  runDir = await mkdtemp(join(tmpdir(), 'control-clear-'));
});

afterEach(async () => {
  await rm(runDir, { recursive: true, force: true });
});

describe('removeControlRequestIfUnchanged', () => {
  it('removes the request that was read', async () => {
    await writeControlRequest(runDir, resumeRequest);
    assert.equal(await removeControlRequestIfUnchanged(runDir, resumeRequest), 'removed');
    assert.deepEqual(await readControlRequest(runDir), { status: 'absent' });
    assert.deepEqual(await readdir(runDir), []);
  });

  it('keeps a pause written after the read, and leaves no parked file behind', async () => {
    await writeControlRequest(runDir, resumeRequest);
    const read = await readControlRequest(runDir);
    assert.equal(read.status, 'present');
    await writeControlRequest(runDir, pauseRequest);
    assert.equal(await removeControlRequestIfUnchanged(runDir, resumeRequest), 'kept-newer');
    assert.deepEqual(await readControlRequest(runDir), { status: 'present', value: pauseRequest });
    assert.deepEqual(await readdir(runDir), ['control.json']);
  });

  it('treats a request with the same flags but another instant as newer', async () => {
    const later: ControlRequest = { ...resumeRequest, at: AT_MS + 5 };
    await writeControlRequest(runDir, later);
    assert.equal(await removeControlRequestIfUnchanged(runDir, resumeRequest), 'kept-newer');
    assert.deepEqual(await readControlRequest(runDir), { status: 'present', value: later });
  });

  it('answers absent when there is nothing to clear', async () => {
    assert.equal(await removeControlRequestIfUnchanged(runDir, resumeRequest), 'absent');
  });
});
