import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  PlatformPathError,
  accountDirectory,
  accountFilePath,
  checkedPlatformRoot,
  gatesFilePath,
  metricBatchFilePath,
  metricsInboxDirectory,
  pollCursorFilePath,
  publishAttemptDirectory,
  publishFilePath,
} from './paths';

/*
 * Path containment of the platform protocol (SPEC 0007 section 4.6): every id is validated before a
 * join and no builder answers a path outside `<data home>/platform/`. No file is touched here.
 */

const ROOT = join('/', 'data-home-under-test', 'platform');
const ATTEMPT_ID = '01JD2Q7F3M8V5K9X4T6R2N0B1C';

function isPathError(error: unknown): boolean {
  return error instanceof PlatformPathError && error.code === 'path-outside-run';
}

describe('platform root', () => {
  it('accepts an absolute folder named platform', () => {
    assert.equal(checkedPlatformRoot(ROOT), ROOT);
    assert.equal(checkedPlatformRoot(`${ROOT}/`), ROOT);
  });

  it('refuses a relative root', () => {
    assert.throws(() => checkedPlatformRoot('platform'), isPathError);
  });

  it('refuses a root with another folder name, including one reached through ..', () => {
    assert.throws(() => checkedPlatformRoot(join('/', 'data-home-under-test', 'runs')), isPathError);
    assert.throws(() => checkedPlatformRoot(`${ROOT}/..`), isPathError);
  });
});

describe('platform path builders', () => {
  it('builds every documented path inside the platform folder', () => {
    assert.equal(gatesFilePath(ROOT), join(ROOT, 'gates.json'));
    assert.equal(accountDirectory(ROOT, 'youtube'), join(ROOT, 'accounts', 'youtube'));
    assert.equal(accountFilePath(ROOT, 'tiktok', 'tokenLock'), join(ROOT, 'accounts', 'tiktok', 'token.lock'));
    assert.equal(accountFilePath(ROOT, 'instagram', 'health'), join(ROOT, 'accounts', 'instagram', 'health.json'));
    assert.equal(publishAttemptDirectory(ROOT, ATTEMPT_ID), join(ROOT, 'publish', ATTEMPT_ID));
    assert.equal(publishFilePath(ROOT, ATTEMPT_ID, 'request'), join(ROOT, 'publish', ATTEMPT_ID, 'request.json'));
    assert.equal(publishFilePath(ROOT, ATTEMPT_ID, 'cancel'), join(ROOT, 'publish', ATTEMPT_ID, 'cancel'));
    assert.equal(pollCursorFilePath(ROOT), join(ROOT, 'polls', 'cursor.json'));
    assert.equal(metricsInboxDirectory(ROOT), join(ROOT, 'metrics-inbox'));
    assert.equal(metricBatchFilePath(ROOT, ATTEMPT_ID), join(ROOT, 'metrics-inbox', `${ATTEMPT_ID}.json`));
  });

  it('refuses a platform name outside the enum, including a traversal', () => {
    // The typed signature forbids these values; Reflect.apply reaches the runtime guard untyped.
    assert.throws(() => Reflect.apply(accountDirectory, undefined, [ROOT, '../gates.json']), isPathError);
    assert.throws(() => Reflect.apply(accountFilePath, undefined, [ROOT, 'facebook', 'account']), isPathError);
  });

  it('refuses an attempt id that is not a ULID', () => {
    for (const attemptId of ['../accounts', 'not-a-ulid', '', `${ATTEMPT_ID}/x`, ATTEMPT_ID.toLowerCase()]) {
      assert.throws(() => publishAttemptDirectory(ROOT, attemptId), isPathError, attemptId);
      assert.throws(() => publishFilePath(ROOT, attemptId, 'state'), isPathError, attemptId);
    }
  });

  it('refuses a batch id that is not a ULID', () => {
    for (const batchId of ['../gates', 'batch', `${ATTEMPT_ID}.json`]) {
      assert.throws(() => metricBatchFilePath(ROOT, batchId), isPathError, batchId);
    }
  });

  it('refuses every builder when the root itself is not a platform folder', () => {
    const wrongRoot = join('/', 'data-home-under-test');
    assert.throws(() => gatesFilePath(wrongRoot), isPathError);
    assert.throws(() => publishFilePath(wrongRoot, ATTEMPT_ID, 'request'), isPathError);
    assert.throws(() => metricsInboxDirectory(wrongRoot), isPathError);
  });
});
