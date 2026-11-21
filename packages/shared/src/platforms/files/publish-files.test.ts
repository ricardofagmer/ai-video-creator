import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { RunFileSchemaError } from '../../run-files/errors';
import { currentBootTimeMs, isSameBoot } from '../../run-files/process-identity';
import { type PublishRequestFile, type PublishStateFile } from '../publish-files';
import { PlatformPathError, publishAttemptDirectory, publishFilePath } from './paths';
import {
  PublishAttemptExistsError,
  claimPublishAttempt,
  createCancelMarker,
  createPublishRequest,
  hasCancelMarker,
  isPublishClaimantAlive,
  listPublishAttemptIds,
  readPublishClaim,
  readPublishRequest,
  readPublishState,
  writePublishState,
} from './publish-files';

/*
 * Publish attempt files (SPEC 0007 sections 4.3, 4.6 and 5.4; K4, K5, AC 51): `request.json` is
 * written once, `cancel` only before `claim`, a claim is never taken twice.
 */

const ATTEMPT_ID = '01JD2Q7F3M8V5K9X4T6R2N0B1C';
const SECOND_ATTEMPT_ID = '01JD2Q7F3M8V5K9X4T6R2N0B1D';
const RUN_ID = '01JD2Q7F3M8V5K9X4T6R2N0B1E';
const CONNECTION_ID = '01JD2Q7F3M8V5K9X4T6R2N0B1F';

function requestFile(overrides: Partial<PublishRequestFile> = {}): PublishRequestFile {
  return {
    format: 1,
    attemptId: ATTEMPT_ID,
    runId: RUN_ID,
    platform: 'youtube',
    connectionId: CONNECTION_ID,
    mode: 'mock',
    requestedAt: '2026-11-20T10:00:00.000Z',
    expiresAt: '2026-11-20T12:00:00.000Z',
    requestedBy: 'owner',
    createdBy: 'api',
    correlationId: null,
    artifact: { sha256: 'a'.repeat(64), sizeBytes: 1024 },
    approvalDecidedAt: '2026-11-20T09:00:00.000Z',
    metadata: { title: 'Tour do produto', caption: '', tags: ['tour'], visibility: 'private', aiDisclosure: true },
    biometric: { refs: [], confirmedAt: '2026-11-20T10:00:00.000Z' },
    ...overrides,
  };
}

function stateFile(overrides: Partial<PublishStateFile> = {}): PublishStateFile {
  return {
    format: 1,
    attemptId: ATTEMPT_ID,
    state: 'uploading',
    since: '2026-11-20T10:05:00.000Z',
    bytesSent: 0,
    bytesTotal: 1024,
    reasonId: null,
    platformVideoId: null,
    platformMediaId: null,
    publishedAt: null,
    followUntil: null,
    ...overrides,
  };
}

describe('publish attempt files', () => {
  let root: string;
  let platformRoot: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'platform-publish-files-'));
    platformRoot = join(root, 'platform');
    await mkdir(platformRoot);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('creates request.json once, mode 600 inside a 700 folder, and reads it back', async () => {
    await createPublishRequest(platformRoot, requestFile());

    const read = await readPublishRequest(platformRoot, ATTEMPT_ID);
    assert.deepEqual(read, { status: 'present', value: requestFile() });
    assert.equal((await stat(publishFilePath(platformRoot, ATTEMPT_ID, 'request'))).mode & 0o777, 0o600);
    assert.equal((await stat(publishAttemptDirectory(platformRoot, ATTEMPT_ID))).mode & 0o777, 0o700);
  });

  it('refuses a second request for the same attempt and keeps the first file', async () => {
    await createPublishRequest(platformRoot, requestFile());
    const second = requestFile({ requestedBy: 'someone-else' });

    await assert.rejects(createPublishRequest(platformRoot, second), PublishAttemptExistsError);
    const read = await readPublishRequest(platformRoot, ATTEMPT_ID);
    assert.equal(read.status === 'present' ? read.value.requestedBy : null, 'owner');
  });

  it('removes the new folder when the request does not validate, leaving no attempt behind', async () => {
    const invalid = requestFile({ metadata: { ...requestFile().metadata, tags: ['https://example.invalid'] } });

    await assert.rejects(createPublishRequest(platformRoot, invalid), RunFileSchemaError);
    await assert.rejects(stat(publishAttemptDirectory(platformRoot, ATTEMPT_ID)), { code: 'ENOENT' });
    assert.deepEqual(await listPublishAttemptIds(platformRoot), []);
  });

  it('refuses to create an attempt when publish/ is not a real folder', async () => {
    await writeFile(join(platformRoot, 'publish'), 'a file where the folder belongs');

    await assert.rejects(createPublishRequest(platformRoot, requestFile()), PlatformPathError);
  });

  it('reads an absent request while the folder is empty', async () => {
    await mkdir(join(platformRoot, 'publish', ATTEMPT_ID), { recursive: true });
    assert.deepEqual(await readPublishRequest(platformRoot, ATTEMPT_ID), { status: 'absent' });
  });

  it('refuses a request whose attemptId does not match its folder', async () => {
    await createPublishRequest(platformRoot, requestFile());
    const folder = join(platformRoot, 'publish', SECOND_ATTEMPT_ID);
    await mkdir(folder);
    await writeFile(join(folder, 'request.json'), await readFile(publishFilePath(platformRoot, ATTEMPT_ID, 'request')));

    await assert.rejects(readPublishRequest(platformRoot, SECOND_ATTEMPT_ID), RunFileSchemaError);
  });
});

describe('cancel and claim', () => {
  let root: string;
  let platformRoot: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'platform-publish-claim-'));
    platformRoot = join(root, 'platform');
    await mkdir(platformRoot);
    await createPublishRequest(platformRoot, requestFile());
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('cancels a queued attempt once, then answers already-cancelled', async () => {
    assert.equal(await hasCancelMarker(platformRoot, ATTEMPT_ID), false);
    assert.equal(await createCancelMarker(platformRoot, ATTEMPT_ID), 'cancelled');
    assert.equal(await hasCancelMarker(platformRoot, ATTEMPT_ID), true);
    assert.equal(await createCancelMarker(platformRoot, ATTEMPT_ID), 'already-cancelled');
  });

  it('refuses to cancel a claimed attempt and writes no marker (AC 51)', async () => {
    assert.equal(await claimPublishAttempt(platformRoot, ATTEMPT_ID, process.pid), 'claimed');

    assert.equal(await createCancelMarker(platformRoot, ATTEMPT_ID), 'claimed');
    assert.equal(await hasCancelMarker(platformRoot, ATTEMPT_ID), false);
  });

  it('claims an attempt once and reads the claimant pid with the boot it runs under (C1)', async () => {
    assert.deepEqual(await readPublishClaim(platformRoot, ATTEMPT_ID), { status: 'absent' });
    assert.equal(await claimPublishAttempt(platformRoot, ATTEMPT_ID, process.pid), 'claimed');
    assert.equal(await claimPublishAttempt(platformRoot, ATTEMPT_ID, process.ppid), 'taken');

    const text = await readFile(publishFilePath(platformRoot, ATTEMPT_ID, 'claim'), 'utf8');
    assert.match(text, new RegExp(`^${process.pid} [0-9]+\\n$`));
    const read = await readPublishClaim(platformRoot, ATTEMPT_ID);
    assert.equal(read.status, 'present');
    if (read.status !== 'present') return;
    assert.equal(read.stamp?.pid, process.pid);
    assert.equal(isSameBoot(read.stamp?.bootTimeMs ?? null), true);
  });

  it('reads an older claim holding only a pid as a stamp without a boot time', async () => {
    await writeFile(publishFilePath(platformRoot, ATTEMPT_ID, 'claim'), '4321\n');
    assert.deepEqual(await readPublishClaim(platformRoot, ATTEMPT_ID), { status: 'present', stamp: { pid: 4321, bootTimeMs: null } });
  });

  it('reads an unparsable or oversized claim as present with no stamp', async () => {
    const claimPath = publishFilePath(platformRoot, ATTEMPT_ID, 'claim');
    await writeFile(claimPath, 'not a pid\n');
    assert.deepEqual(await readPublishClaim(platformRoot, ATTEMPT_ID), { status: 'present', stamp: null });
    await writeFile(claimPath, `${'9'.repeat(200)}\n`);
    assert.deepEqual(await readPublishClaim(platformRoot, ATTEMPT_ID), { status: 'present', stamp: null });
  });

  it('writes and reads state.json and refuses a state that breaks the rules', async () => {
    assert.deepEqual(await readPublishState(platformRoot, ATTEMPT_ID), { status: 'absent' });
    await writePublishState(platformRoot, stateFile());
    assert.deepEqual(await readPublishState(platformRoot, ATTEMPT_ID), { status: 'present', value: stateFile() });

    await assert.rejects(writePublishState(platformRoot, stateFile({ state: 'failed' })), RunFileSchemaError);
    await assert.rejects(writePublishState(platformRoot, stateFile({ bytesSent: 2048 })), RunFileSchemaError);
    await assert.rejects(writePublishState(platformRoot, stateFile({ state: 'published' })), RunFileSchemaError);
    await assert.rejects(writePublishState(platformRoot, stateFile({ state: 'sent-to-inbox' })), RunFileSchemaError);
  });

  it('refuses to write state.json for an attempt that has no folder', async () => {
    await assert.rejects(writePublishState(platformRoot, stateFile({ attemptId: SECOND_ATTEMPT_ID })));
    await assert.rejects(stat(publishAttemptDirectory(platformRoot, SECOND_ATTEMPT_ID)), { code: 'ENOENT' });
  });

  it('lists only ULID-named real folders, oldest first', async () => {
    const earlier = '01JD2Q7F3M8V5K9X4T6R2N0B0A';
    await createPublishRequest(platformRoot, requestFile({ attemptId: earlier }));
    await mkdir(join(platformRoot, 'publish', 'not-an-attempt'));
    await writeFile(join(platformRoot, 'publish', SECOND_ATTEMPT_ID), 'a file, not a folder');
    await symlink(join(platformRoot, 'publish', ATTEMPT_ID), join(platformRoot, 'publish', '01JD2Q7F3M8V5K9X4T6R2N0B2Z'));

    assert.deepEqual(await listPublishAttemptIds(platformRoot), [earlier, ATTEMPT_ID]);
  });
});

describe('isPublishClaimantAlive (C1)', () => {
  // `process.kill` is stubbed in every case, so no signal reaches a real process.
  const OWNER_PID = 424_242;
  const SELF_PID = 515_151;

  function errorWithCode(code: string): Error {
    return Object.assign(new Error(`stubbed ${code}`), { code });
  }

  afterEach(() => {
    mock.restoreAll();
  });

  it('answers alive for a live claimant of this boot', () => {
    mock.method(process, 'kill', () => true);
    assert.equal(isPublishClaimantAlive({ pid: OWNER_PID, bootTimeMs: currentBootTimeMs() }, SELF_PID), true);
  });

  it('answers dead for an unreadable claim', () => {
    const kill = mock.method(process, 'kill', () => true);
    assert.equal(isPublishClaimantAlive(null, SELF_PID), false);
    assert.equal(kill.mock.callCount(), 0);
  });

  it('answers dead for a claim written under another boot, whatever its pid answers', () => {
    const kill = mock.method(process, 'kill', () => true);
    assert.equal(isPublishClaimantAlive({ pid: OWNER_PID, bootTimeMs: currentBootTimeMs() - 86_400_000 }, SELF_PID), false);
    assert.equal(isPublishClaimantAlive({ pid: OWNER_PID, bootTimeMs: null }, SELF_PID), false);
    assert.equal(kill.mock.callCount(), 0);
  });

  it('answers dead for a claimant pid that belongs to another user (EPERM)', () => {
    mock.method(process, 'kill', () => {
      throw errorWithCode('EPERM');
    });
    assert.equal(isPublishClaimantAlive({ pid: OWNER_PID, bootTimeMs: currentBootTimeMs() }, SELF_PID), false);
  });

  it('answers dead for a claim naming the reading process itself', () => {
    const kill = mock.method(process, 'kill', () => true);
    assert.equal(isPublishClaimantAlive({ pid: SELF_PID, bootTimeMs: currentBootTimeMs() }, SELF_PID), false);
    assert.equal(kill.mock.callCount(), 0);
  });
});
