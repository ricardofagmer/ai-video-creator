import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  RunFileInvalidJsonError,
  RunFileNotFoundError,
  RunFileSchemaError,
  UnsupportedRunFormatError,
} from '../../run-files/errors';
import { newUlid } from '../../run-files/ulid';
import { type PlatformMetrics } from '../../metrics/snapshot';
import { metricBatchBounds } from '../constants';
import { type MetricBatchFile, type PollCursorFile } from '../poll-files';
import { metricBatchFilePath, metricsInboxDirectory } from './paths';
import {
  MetricBatchExistsError,
  MetricBatchRefusedError,
  createMetricBatch,
  deleteMetricBatch,
  listMetricBatchIds,
  readMetricBatch,
  readPollCursor,
  writePollCursor,
} from './poll-files';

/*
 * The metrics inbox and the poll cursor (SPEC 0007 sections 4.3, 4.6, 5.5 and 5.6): a batch is
 * created once, read only under 256 KiB with a strict schema and 1 to 50 rows, one per publication.
 */

const BATCH_ID = '01JD2Q7F3M8V5K9X4T6R2N0B1C';
const NOW_MS = Date.parse('2026-11-20T10:00:00.000Z');

function metrics(views: number): PlatformMetrics {
  return {
    views,
    likes: 10,
    comments: 2,
    shares: null,
    saves: null,
    impressions: null,
    reach: null,
    followersGained: null,
    watchTimeSeconds: null,
    averageViewDurationSeconds: null,
    averageViewPercent: null,
  };
}

function batch(rowCount: number, overrides: Partial<MetricBatchFile> = {}): MetricBatchFile {
  return {
    format: 1,
    batchId: BATCH_ID,
    platform: 'youtube',
    mode: 'mock',
    asOfDate: '2026-11-19',
    pulledAt: '2026-11-20T09:00:00.000Z',
    rows: Array.from({ length: rowCount }, (_, index) => ({ publicationId: newUlid(NOW_MS), metrics: metrics(100 + index) })),
    ...overrides,
  };
}

describe('metric batch files', () => {
  let root: string;
  let platformRoot: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'platform-poll-files-'));
    platformRoot = join(root, 'platform');
    await mkdir(platformRoot);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('creates a batch mode 600, leaves no temp file, and reads it back with its sha-256 and size', async () => {
    const file = batch(2);
    await createMetricBatch(platformRoot, file);

    const target = metricBatchFilePath(platformRoot, BATCH_ID);
    const bytes = await readFile(target);
    const read = await readMetricBatch(platformRoot, BATCH_ID);

    assert.deepEqual(read.value, file);
    assert.equal(read.sizeBytes, bytes.length);
    assert.equal(read.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal((await stat(target)).mode & 0o777, 0o600);
    assert.deepEqual(await listMetricBatchIds(platformRoot), [BATCH_ID]);
  });

  it('never replaces an existing batch', async () => {
    await createMetricBatch(platformRoot, batch(1));
    const before = await readFile(metricBatchFilePath(platformRoot, BATCH_ID), 'utf8');

    await assert.rejects(createMetricBatch(platformRoot, batch(3)), MetricBatchExistsError);
    assert.equal(await readFile(metricBatchFilePath(platformRoot, BATCH_ID), 'utf8'), before);
  });

  it('accepts exactly the maximum row count and refuses one more, or none', async () => {
    await createMetricBatch(platformRoot, batch(metricBatchBounds.maxRows));
    const other = newUlid(NOW_MS);

    await assert.rejects(createMetricBatch(platformRoot, batch(metricBatchBounds.maxRows + 1, { batchId: other })), RunFileSchemaError);
    await assert.rejects(createMetricBatch(platformRoot, batch(0, { batchId: other })), RunFileSchemaError);
    assert.deepEqual(await listMetricBatchIds(platformRoot), [BATCH_ID]);
  });

  it('refuses two rows for one publication', async () => {
    const publicationId = newUlid(NOW_MS);
    const duplicate = batch(0, {
      rows: [
        { publicationId, metrics: metrics(100) },
        { publicationId, metrics: metrics(200) },
      ],
    });
    await assert.rejects(createMetricBatch(platformRoot, duplicate), RunFileSchemaError);
  });

  it('refuses to read a missing batch', async () => {
    await assert.rejects(readMetricBatch(platformRoot, BATCH_ID), RunFileNotFoundError);
  });

  it('refuses to read a batch larger than the byte bound, and leaves it in place', async () => {
    await mkdir(metricsInboxDirectory(platformRoot));
    const target = metricBatchFilePath(platformRoot, BATCH_ID);
    await writeFile(target, ' '.repeat(metricBatchBounds.maxFileBytes + 1));

    await assert.rejects(readMetricBatch(platformRoot, BATCH_ID), MetricBatchRefusedError);
    assert.equal((await stat(target)).size, metricBatchBounds.maxFileBytes + 1);
  });

  it('refuses to read a batch name that is a symlink, so no file outside the inbox is read', async () => {
    await mkdir(metricsInboxDirectory(platformRoot));
    const outside = join(root, 'outside.json');
    await writeFile(outside, JSON.stringify(batch(1)));
    await symlink(outside, metricBatchFilePath(platformRoot, BATCH_ID));

    await assert.rejects(readMetricBatch(platformRoot, BATCH_ID), MetricBatchRefusedError);
  });

  it('refuses invalid JSON, a newer format, extra fields and a batchId that differs from the name', async () => {
    await mkdir(metricsInboxDirectory(platformRoot));
    const target = metricBatchFilePath(platformRoot, BATCH_ID);

    await writeFile(target, '{ not json');
    await assert.rejects(readMetricBatch(platformRoot, BATCH_ID), RunFileInvalidJsonError);

    await writeFile(target, JSON.stringify({ ...batch(1), format: 2 }));
    await assert.rejects(readMetricBatch(platformRoot, BATCH_ID), UnsupportedRunFormatError);

    await writeFile(target, JSON.stringify({ ...batch(1), title: 'not allowed' }));
    await assert.rejects(readMetricBatch(platformRoot, BATCH_ID), RunFileSchemaError);

    await writeFile(target, JSON.stringify(batch(1, { batchId: newUlid(NOW_MS) })));
    await assert.rejects(readMetricBatch(platformRoot, BATCH_ID), RunFileSchemaError);
  });

  it('lists only regular files named <ULID>.json, oldest first', async () => {
    const earlier = '01JD2Q7F3M8V5K9X4T6R2N0B0A';
    await createMetricBatch(platformRoot, batch(1, { batchId: earlier }));
    await createMetricBatch(platformRoot, batch(1));
    const inbox = metricsInboxDirectory(platformRoot);
    await writeFile(join(inbox, `${BATCH_ID}.json.tmp-1`), '{}');
    await writeFile(join(inbox, 'notes.json'), '{}');
    await mkdir(join(inbox, '01JD2Q7F3M8V5K9X4T6R2N0B2A.json'));
    await symlink(metricBatchFilePath(platformRoot, BATCH_ID), join(inbox, '01JD2Q7F3M8V5K9X4T6R2N0B2B.json'));

    assert.deepEqual(await listMetricBatchIds(platformRoot), [earlier, BATCH_ID]);
  });

  it('lists nothing when the inbox folder does not exist, and delete is idempotent', async () => {
    assert.deepEqual(await listMetricBatchIds(platformRoot), []);
    await createMetricBatch(platformRoot, batch(1));

    await deleteMetricBatch(platformRoot, BATCH_ID);
    await deleteMetricBatch(platformRoot, BATCH_ID);
    assert.deepEqual(await listMetricBatchIds(platformRoot), []);
  });
});

describe('poll cursor file', () => {
  let root: string;
  let platformRoot: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'platform-poll-cursor-'));
    platformRoot = join(root, 'platform');
    await mkdir(platformRoot);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reads absent before the first pass, then round-trips the cursor', async () => {
    assert.deepEqual(await readPollCursor(platformRoot), { status: 'absent' });
    const cursor: PollCursorFile = {
      format: 1,
      updatedAt: '2026-11-20T10:00:00.000Z',
      entries: { [BATCH_ID]: { lastPolledOn: '2026-11-20', stopped: null, strikes: 0, platformMediaId: null } },
    };

    await writePollCursor(platformRoot, cursor);
    assert.deepEqual(await readPollCursor(platformRoot), { status: 'present', value: cursor });
  });
});
