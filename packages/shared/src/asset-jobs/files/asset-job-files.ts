import { type Dirent } from 'node:fs';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { AssetRefSchema, type AssetRef } from '../../catalog/asset-kind';
import { appendJsonLine, writeJsonAtomic } from '../../run-files/atomic-write';
import { RunFileError, RunFileSchemaError, RunFileWriteError, hasErrorCode } from '../../run-files/errors';
import { readOptionalJsonFile, type OptionalFile } from '../../run-files/read';
import {
  AssetJobEgressLineSchema,
  AssetJobFileSchema,
  isTerminalAssetJobStatus,
  type AssetJobEgressLine,
  type AssetJobFile,
  type AssetJobKind,
} from '../asset-job';
import { AssetJobCostFileSchema, type AssetJobCostFile } from '../cost';
import { assetJobDirectory, assetJobFilePath, assetJobKindDirectory, type AssetJobLocation } from './paths';

/** Job folders hold model text and voice samples; only the owner's account reads them. */
const ASSET_JOB_FOLDER_MODE = 0o700;

/** A request for a job that is still `requested` or `running`. */
export class AssetJobOpenError extends RunFileError {
  override readonly code = 'write-failed';

  constructor(filePath: string) {
    super(`Asset job is still open: ${filePath}`, filePath);
    this.name = 'AssetJobOpenError';
  }
}

function assertSameJob(filePath: string, location: AssetJobLocation, file: AssetJobFile): void {
  if (file.ref !== location.ref || file.kind !== location.kind) {
    throw new RunFileSchemaError(filePath, ['ref or kind does not match the job folder']);
  }
}

/** `job.json`; absent when the version never had this job. */
export async function readAssetJobState(location: AssetJobLocation): Promise<OptionalFile<AssetJobFile>> {
  return readOptionalJsonFile(assetJobFilePath(location, 'job'), AssetJobFileSchema);
}

/**
 * The api's one write per request: creates the job folder when missing and writes `job.json` with
 * status `requested`. An open job (`requested` or `running`) throws `AssetJobOpenError`, so the
 * api never writes over the watcher; a terminal job is replaced, which is how the owner asks again.
 */
export async function writeRequestedAssetJob(location: AssetJobLocation, file: AssetJobFile): Promise<void> {
  const filePath = assetJobFilePath(location, 'job');
  assertSameJob(filePath, location, file);
  if (file.status !== 'requested') throw new RunFileSchemaError(filePath, ['a request must have status requested']);
  const current = await readAssetJobState(location);
  if (current.status === 'present' && !isTerminalAssetJobStatus(current.value.status)) throw new AssetJobOpenError(filePath);
  try {
    await mkdir(assetJobDirectory(location), { recursive: true, mode: ASSET_JOB_FOLDER_MODE });
  } catch (error) {
    throw new RunFileWriteError(assetJobDirectory(location), { cause: error });
  }
  await writeJsonAtomic(filePath, AssetJobFileSchema, file);
}

/** The watcher's writes after its claim (claim, final status). Status `requested` is refused. */
export async function writeAssetJobState(location: AssetJobLocation, file: AssetJobFile): Promise<void> {
  const filePath = assetJobFilePath(location, 'job');
  assertSameJob(filePath, location, file);
  if (file.status === 'requested') throw new RunFileSchemaError(filePath, ['status requested is written only by a request']);
  await writeJsonAtomic(filePath, AssetJobFileSchema, file);
}

/** Appends one line to the job's `egress.jsonl`, before the bytes leave the machine. */
export async function appendAssetJobEgress(location: AssetJobLocation, line: AssetJobEgressLine): Promise<void> {
  await appendJsonLine(assetJobFilePath(location, 'egress'), AssetJobEgressLineSchema, line);
}

/** `cost.json`; absent before the job's first billed call. It survives re-requests and sample removal. */
export async function readAssetJobCost(location: AssetJobLocation): Promise<OptionalFile<AssetJobCostFile>> {
  return readOptionalJsonFile(assetJobFilePath(location, 'cost'), AssetJobCostFileSchema);
}

/**
 * The watcher's write after a billed call (spec Amendment 3), atomic. A file of another job is
 * refused. The folder is created when missing: a call is billed only after the job was requested,
 * but the cost must never be lost to a folder removed in between.
 */
export async function writeAssetJobCost(location: AssetJobLocation, cost: AssetJobCostFile): Promise<void> {
  const filePath = assetJobFilePath(location, 'cost');
  if (cost.ref !== location.ref || cost.kind !== location.kind) {
    throw new RunFileSchemaError(filePath, ['ref or kind does not match the job folder']);
  }
  try {
    await mkdir(assetJobDirectory(location), { recursive: true, mode: ASSET_JOB_FOLDER_MODE });
  } catch (error) {
    throw new RunFileWriteError(assetJobDirectory(location), { cause: error });
  }
  await writeJsonAtomic(filePath, AssetJobCostFileSchema, cost);
}

/** Removes the job's kept sample clips (a new request, or a deprecated voice). Missing files are fine. */
export async function removeAssetJobSamples(location: AssetJobLocation): Promise<void> {
  for (const key of ['sampleMp3', 'sampleWav'] as const) {
    const filePath = assetJobFilePath(location, key);
    try {
      await rm(filePath, { force: true });
    } catch (error) {
      throw new RunFileWriteError(filePath, { cause: error });
    }
  }
}

/** Refs that have a folder under `<assetJobsRoot>/<kind>/`, sorted; names that are not refs are skipped. */
export async function listAssetJobRefs(assetJobsRoot: string, kind: AssetJobKind): Promise<AssetRef[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(assetJobKindDirectory(assetJobsRoot, kind), { withFileTypes: true });
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return [];
    throw error;
  }
  const refs: AssetRef[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const parsed = AssetRefSchema.safeParse(entry.name);
    if (parsed.success) refs.push(parsed.data);
  }
  return refs.sort();
}
