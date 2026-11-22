import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { inspect } from 'node:util';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { type PublishRequestFile } from '@studio/shared/platforms';
import { publishFilePath, publishMetadataSha256 } from '@studio/shared/platforms/files';
import { queuePublishRequest } from './platform-fixtures.harness.test';
import { createPlatformHarness, prepareRun, publicationLines, stateOf, type PlatformHarness } from './platform-step.harness.test';
import { type AttemptRowMismatch, type PublicationAttemptRow } from './publication-attempt.reader';

/*
 * `request.json` is uploaded only when it is the request the api recorded (SPEC 0007 section 5.5
 * step 8, finding S3): its `publication_attempts` row exists, is `queued`, and agrees on run,
 * platform, connection, mode, artifact, metadata, biometric set, approval and expiry. Any mismatch
 * closes the attempt `failed` / `request-mismatch` before the token is touched, sends nothing, and
 * records `publish.request-mismatch` naming the field only, never a value. The row comes from the
 * SQLite double, built from `request.json` and edited per case. Finding F-3: the row's
 * `metadata_sha256` must equal `publishMetadataSha256` of `request.json`'s metadata; null (a row
 * older than the column) is not comparable and refuses too.
 */

/** A title written into `request.json` after the api recorded it; it must never reach a log line. */
const EDITED_TITLE = 'Titulo editado fora da api';

/** A value only the edited row carries; it must never reach a log line or an event. */
const ROW_ONLY_VALUE = 'row-only-sentinel-value';
const SECOND_MS = 1_000;

const mismatches: readonly { name: string; field: AttemptRowMismatch; edit: (row: PublicationAttemptRow) => PublicationAttemptRow | null }[] = [
  { name: 'the row is missing', field: 'row-missing', edit: () => null },
  { name: 'the row is no longer queued', field: 'state', edit: (row) => ({ ...row, state: 'cancelled' }) },
  { name: 'the row names another run', field: 'run', edit: (row) => ({ ...row, runId: ROW_ONLY_VALUE }) },
  { name: 'the row names another platform', field: 'platform', edit: (row) => ({ ...row, platform: 'tiktok' }) },
  { name: 'the row names another connection', field: 'connection', edit: (row) => ({ ...row, connectionId: ROW_ONLY_VALUE }) },
  { name: 'the row was recorded in the other mode', field: 'mode', edit: (row) => ({ ...row, mode: 'live' }) },
  { name: 'the row records another artifact hash', field: 'artifact', edit: (row) => ({ ...row, artifactSha256: ROW_ONLY_VALUE }) },
  { name: 'the row records another artifact size', field: 'artifact', edit: (row) => ({ ...row, artifactBytes: row.artifactBytes + BigInt(1) }) },
  { name: 'the row records another visibility', field: 'metadata', edit: (row) => ({ ...row, visibility: 'public' }) },
  { name: 'the row records another AI disclosure', field: 'metadata', edit: (row) => ({ ...row, aiDisclosure: !row.aiDisclosure }) },
  { name: 'the row has no metadata hash (written before finding F-3)', field: 'metadata', edit: (row) => ({ ...row, metadataSha256: null }) },
  { name: 'the row records another metadata hash', field: 'metadata', edit: (row) => ({ ...row, metadataSha256: ROW_ONLY_VALUE }) },
  { name: 'the row confirms another biometric set', field: 'biometric', edit: (row) => ({ ...row, biometricRefsJson: JSON.stringify([ROW_ONLY_VALUE]) }) },
  {
    name: 'the row confirmed the biometric set at another instant',
    field: 'biometric',
    edit: (row) => ({ ...row, biometricConfirmedAt: new Date(row.biometricConfirmedAt.getTime() + SECOND_MS) }),
  },
  {
    name: 'the row records another approval decision',
    field: 'approval',
    edit: (row) => ({ ...row, approvalDecidedAt: new Date(row.approvalDecidedAt.getTime() + SECOND_MS) }),
  },
  { name: 'the row records another expiry', field: 'expiry', edit: (row) => ({ ...row, expiresAt: new Date(row.expiresAt.getTime() + SECOND_MS) }) },
];

describe('PublishStep matches request.json against its publication_attempts row (finding S3)', () => {
  let harness: PlatformHarness;

  beforeEach(async () => {
    harness = await createPlatformHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  async function queueRequest(): Promise<{ attemptId: string; runId: string; request: PublishRequestFile }> {
    const { connectionId, run } = await prepareRun(harness, 'youtube');
    const request = await queuePublishRequest(harness.platformRoot, { run, platform: 'youtube', connectionId, at: harness.clock.now() });
    return { attemptId: request.attemptId, runId: run.runId, request };
  }

  it('uploads when the row is queued and agrees on every field', async () => {
    const queued = await queueRequest();

    assert.equal(await harness.publish.claimNext(), true);

    assert.equal(harness.clients.youtube.calls.upload, 1);
    assert.equal((await stateOf(harness, queued.attemptId))?.state, 'published');
    assert.deepEqual(harness.events.ofType('publish.request-mismatch'), []);
  });

  for (const mismatch of mismatches) {
    it(`sends nothing and fails request-mismatch, naming field ${mismatch.field} without its value, when ${mismatch.name}`, async () => {
      const queued = await queueRequest();
      harness.prisma.attemptRowEdit = mismatch.edit;

      assert.equal(await harness.publish.claimNext(), true);

      const state = await stateOf(harness, queued.attemptId);
      assert.equal(state?.state, 'failed');
      assert.equal(state?.reasonId, 'request-mismatch');
      assert.equal(state?.bytesSent, 0);
      assert.equal(harness.clients.youtube.calls.upload, 0);
      assert.equal(harness.clients.youtube.calls.refresh, 0, 'refused before the token is touched');
      assert.deepEqual(await publicationLines(harness, queued.runId), []);
      assert.deepEqual(harness.events.ofType('publish.request-mismatch'), [
        { type: 'publish.request-mismatch', attemptId: queued.attemptId, field: mismatch.field },
      ]);
      const logged = [...harness.logs.lines, inspect(harness.events.events, { depth: 8 })].join('\n');
      assert.equal(logged.includes(ROW_ONLY_VALUE), false, 'no row value reaches a log line or an event');
    });
  }

  it('refuses a request.json whose title was edited after the api recorded its metadata hash (finding F-3)', async () => {
    const queued = await queueRequest();
    const recordedHash = publishMetadataSha256(queued.request.metadata);
    const edited: PublishRequestFile = { ...queued.request, metadata: { ...queued.request.metadata, title: EDITED_TITLE } };
    await writeFile(publishFilePath(harness.platformRoot, queued.attemptId, 'request'), JSON.stringify(edited));
    // Every stored column still agrees (visibility, AI disclosure); only the hash the api took tells the edit apart.
    harness.prisma.attemptRowEdit = (row) => ({ ...row, metadataSha256: recordedHash });

    assert.equal(await harness.publish.claimNext(), true);

    const state = await stateOf(harness, queued.attemptId);
    assert.equal(state?.state, 'failed');
    assert.equal(state?.reasonId, 'request-mismatch');
    assert.equal(harness.clients.youtube.calls.upload, 0);
    assert.deepEqual(harness.events.ofType('publish.request-mismatch'), [{ type: 'publish.request-mismatch', attemptId: queued.attemptId, field: 'metadata' }]);
    const logged = [...harness.logs.lines, inspect(harness.events.events, { depth: 8 })].join('\n');
    assert.equal(logged.includes(EDITED_TITLE), false, 'the edited title reaches no log line');
  });

  it('never uploads the attempt on a later tick after a mismatch', async () => {
    const queued = await queueRequest();
    harness.prisma.attemptRowEdit = (row) => ({ ...row, state: 'cancelled' });
    await harness.publish.claimNext();
    harness.prisma.attemptRowEdit = null;

    assert.equal(await harness.publish.claimNext(), false);

    assert.equal(harness.clients.youtube.calls.upload, 0);
    assert.equal((await stateOf(harness, queued.attemptId))?.reasonId, 'request-mismatch');
  });
});
