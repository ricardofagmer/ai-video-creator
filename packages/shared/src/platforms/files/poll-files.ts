import { createHash } from 'node:crypto';
import { link, open } from 'node:fs/promises';
import { dirname } from 'node:path';
import { MetricBatchIdSchema, type MetricBatchId } from '../../common/ids';
import { writeJsonAtomic } from '../../run-files/atomic-write';
import {
  RunFileError,
  RunFileInvalidJsonError,
  RunFileNotFoundError,
  RunFileSchemaError,
  RunFileWriteError,
  UnsupportedRunFormatError,
  describeZodIssues,
  hasErrorCode,
} from '../../run-files/errors';
import { readOptionalJsonFile, type OptionalFile } from '../../run-files/read';
import { PLATFORM_FORMAT_VERSION, metricBatchBounds } from '../constants';
import { MetricBatchFileSchema, PollCursorFileSchema, type MetricBatchFile, type PollCursorFile } from '../poll-files';
import { ensureFolder, readFolderEntries, readSmallFile, removeIfPresent } from './fs-helpers';
import { metricBatchFilePath, metricsInboxDirectory, pollCursorFilePath } from './paths';

/*
 * Writers (SPEC 0007 section 4.6, K2): `polls/cursor.json` and the batch files only by the watcher
 * (`writePollCursor`, `createMetricBatch`); the one stated exception to "one writer per file" is
 * that `IngestMetricBatch` (api or CLI) deletes a batch after its transaction commits
 * (`deleteMetricBatch`), as the watcher deletes `control.json`.
 */

const FILE_MODE = 0o600;
const batchFileNamePattern = /^([0-9A-HJKMNP-TV-Z]{26})\.json$/;

/** A batch file that is larger than `metricBatchBounds.maxFileBytes` or is not a regular file. */
export class MetricBatchRefusedError extends RunFileError {
  override readonly code = 'schema-mismatch';

  constructor(filePath: string, reason: 'too-large-or-not-a-file') {
    super(`Metric batch refused (${reason}): ${filePath}`, filePath);
    this.name = 'MetricBatchRefusedError';
  }
}

/** A batch file name that already exists: a batch is created once and never edited. */
export class MetricBatchExistsError extends RunFileError {
  override readonly code = 'write-failed';

  constructor(filePath: string) {
    super(`Metric batch already exists: ${filePath}`, filePath);
    this.name = 'MetricBatchExistsError';
  }
}

/** `polls/cursor.json`; absent until the watcher's first pass. */
export async function readPollCursor(platformRoot: string): Promise<OptionalFile<PollCursorFile>> {
  return readOptionalJsonFile(pollCursorFilePath(platformRoot), PollCursorFileSchema);
}

/** The watcher's cursor rewrite, after the pass's batch file (section 5.5 step 5). */
export async function writePollCursor(platformRoot: string, file: PollCursorFile): Promise<void> {
  const filePath = pollCursorFilePath(platformRoot);
  await ensureFolder(dirname(filePath));
  await writeJsonAtomic(filePath, PollCursorFileSchema, file);
}

/**
 * The watcher's batch: written to `<batchId>.json.tmp-<pid>`, flushed, then hard-linked to its final
 * name and the temp name removed. Linking fails on an existing name, so a batch is never replaced
 * (`MetricBatchExistsError`), and the ingester never sees a partial file.
 */
export async function createMetricBatch(platformRoot: string, batch: MetricBatchFile): Promise<void> {
  const target = metricBatchFilePath(platformRoot, batch.batchId);
  const checked = MetricBatchFileSchema.safeParse(batch);
  if (!checked.success) throw new RunFileSchemaError(target, describeZodIssues(checked.error.issues));
  await ensureFolder(metricsInboxDirectory(platformRoot));
  const temporary = `${target}.tmp-${process.pid}`;
  try {
    const handle = await open(temporary, 'wx', FILE_MODE);
    try {
      await handle.writeFile(`${JSON.stringify(checked.data, null, 2)}\n`, { encoding: 'utf8' });
      await handle.sync();
    } finally {
      await handle.close();
    }
    await link(temporary, target);
  } catch (error) {
    await removeIfPresent(temporary);
    if (hasErrorCode(error, 'EEXIST')) throw new MetricBatchExistsError(target);
    throw new RunFileWriteError(target, { cause: error });
  }
  await removeIfPresent(temporary);
}

/**
 * One read batch: its content, and the sha-256 and byte size of its UTF-8 text, the `file_sha256` and
 * `file_bytes` of its `metric_imports` row (the duplicate rule, SPEC 0006 R3-AC-08).
 */
export interface ReadMetricBatch {
  value: MetricBatchFile;
  sha256: string;
  sizeBytes: number;
}

function parseBatch(filePath: string, text: string): MetricBatchFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new RunFileInvalidJsonError(filePath, 'document', { cause: error });
  }
  if (typeof parsed === 'object' && parsed !== null && 'format' in parsed && typeof parsed.format === 'number') {
    if (parsed.format > PLATFORM_FORMAT_VERSION) throw new UnsupportedRunFormatError(filePath, parsed.format);
  }
  const checked = MetricBatchFileSchema.safeParse(parsed);
  if (!checked.success) throw new RunFileSchemaError(filePath, describeZodIssues(checked.error.issues));
  return checked.data;
}

/**
 * Section 5.6 step 1: at most 256 KiB, a regular file, strict schema, and the `batchId` inside equal
 * to the file name. Every failure throws a typed run-file error naming the file; the caller logs
 * `metrics.batch-refused` and leaves the file in place, never guessing.
 */
export async function readMetricBatch(platformRoot: string, batchId: MetricBatchId): Promise<ReadMetricBatch> {
  const filePath = metricBatchFilePath(platformRoot, batchId);
  const read = await readSmallFile(filePath, metricBatchBounds.maxFileBytes);
  if (read.status === 'absent') throw new RunFileNotFoundError(filePath);
  if (read.status === 'refused') throw new MetricBatchRefusedError(filePath, 'too-large-or-not-a-file');
  const value = parseBatch(filePath, read.text);
  if (value.batchId !== batchId) throw new RunFileSchemaError(filePath, ['batchId does not match the file name']);
  const bytes = Buffer.from(read.text, 'utf8');
  return { value, sha256: createHash('sha256').update(bytes).digest('hex'), sizeBytes: bytes.length };
}

/**
 * The batch ids in `metrics-inbox/`, oldest first. Only regular files named `<ULID>.json` count;
 * temp files, links and other names are ignored. A missing folder lists nothing.
 */
export async function listMetricBatchIds(platformRoot: string): Promise<MetricBatchId[]> {
  const batchIds: MetricBatchId[] = [];
  for (const entry of await readFolderEntries(metricsInboxDirectory(platformRoot))) {
    if (!entry.isFile()) continue;
    const match = batchFileNamePattern.exec(entry.name);
    const batchId = MetricBatchIdSchema.safeParse(match?.[1]);
    if (batchId.success) batchIds.push(batchId.data);
  }
  return batchIds.sort();
}

/** `IngestMetricBatch` after its commit, or on a duplicate file (section 5.6 steps 2 and 4). */
export async function deleteMetricBatch(platformRoot: string, batchId: MetricBatchId): Promise<void> {
  await removeIfPresent(metricBatchFilePath(platformRoot, batchId));
}
