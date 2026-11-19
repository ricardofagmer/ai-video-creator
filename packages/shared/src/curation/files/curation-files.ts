import { type Dirent } from 'node:fs';
import { lstat, mkdir, readdir, rmdir } from 'node:fs/promises';
import { CurationIdSchema, type CurationId } from '../../common/ids';
import { appendJsonLine, writeJsonAtomic } from '../../run-files/atomic-write';
import { RunFileError, RunFileSchemaError, RunFileWriteError, hasErrorCode } from '../../run-files/errors';
import { readJsonLines, readOptionalJsonFile, type JsonLinesPage, type OptionalFile } from '../../run-files/read';
import { CurationCostFileSchema, type CurationCostFile } from '../cost';
import { CurationFileSchema, type CurationFile } from '../curation-file';
import { CurationEventSchema, type CurationEvent } from '../events';
import { CurationProposalSchema, type CurationProposal } from '../proposal';
import { CurationSessionLineSchema, type CurationSessionLine } from '../session';
import { checkedCurationsRoot, curationDirectory, curationFilePath, type CurationLocation } from './paths';

/** Curation folders hold model text and owner notes; only the owner's account reads them. */
const CURATION_FOLDER_MODE = 0o700;

/** A curation folder or a write-once file that already exists. */
export class CurationFileExistsError extends RunFileError {
  override readonly code = 'write-failed';

  constructor(filePath: string) {
    super(`Curation file already exists: ${filePath}`, filePath);
    this.name = 'CurationFileExistsError';
  }
}

function assertSameCuration(filePath: string, location: CurationLocation, curationId: CurationId): void {
  if (curationId !== location.curationId) {
    throw new RunFileSchemaError(filePath, ['curationId does not match the curation folder']);
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return false;
    throw error;
  }
}

async function removeEmptyFolder(directory: string, writeError: unknown): Promise<void> {
  try {
    await rmdir(directory);
  } catch (cleanupError) {
    throw new RunFileWriteError(directory, {
      cause: new AggregateError([writeError, cleanupError], 'write failed and the new curation folder was not removed'),
    });
  }
}

/**
 * The api's one write (SPEC 0005 section 5.1 step 5): creates `curations/<curationId>/`
 * exclusively (an existing folder throws `CurationFileExistsError`), then writes `curation.json`
 * atomically. Only status `requested` is accepted; after this the api never writes the file again.
 */
export async function createRequestedCuration(location: CurationLocation, file: CurationFile): Promise<void> {
  const filePath = curationFilePath(location, 'curation');
  assertSameCuration(filePath, location, file.curationId);
  if (file.status !== 'requested') throw new RunFileSchemaError(filePath, ['a new curation must have status requested']);
  const directory = curationDirectory(location);
  await mkdir(checkedCurationsRoot(location.curationsRoot), { recursive: true, mode: CURATION_FOLDER_MODE });
  try {
    await mkdir(directory, { mode: CURATION_FOLDER_MODE });
  } catch (error) {
    if (hasErrorCode(error, 'EEXIST')) throw new CurationFileExistsError(directory);
    throw new RunFileWriteError(directory, { cause: error });
  }
  try {
    await writeJsonAtomic(filePath, CurationFileSchema, file);
  } catch (error) {
    await removeEmptyFolder(directory, error);
    throw error;
  }
}

/**
 * The watcher's writes of `curation.json` after its claim (claim, progress, final status). Status
 * `requested` is refused: only `createRequestedCuration` writes it, once.
 */
export async function writeCurationState(location: CurationLocation, file: CurationFile): Promise<void> {
  const filePath = curationFilePath(location, 'curation');
  assertSameCuration(filePath, location, file.curationId);
  if (file.status === 'requested') throw new RunFileSchemaError(filePath, ['status requested is written only at creation']);
  await writeJsonAtomic(filePath, CurationFileSchema, file);
}

/** `curation.json`; absent while the folder is being created. */
export async function readCurationState(location: CurationLocation): Promise<OptionalFile<CurationFile>> {
  return readOptionalJsonFile(curationFilePath(location, 'curation'), CurationFileSchema);
}

/** Writes `proposal.json` once; a second write throws `CurationFileExistsError`. */
export async function writeCurationProposal(location: CurationLocation, proposal: CurationProposal): Promise<void> {
  const filePath = curationFilePath(location, 'proposal');
  assertSameCuration(filePath, location, proposal.curationId);
  // Single writer (the watcher after its claim), so check-then-write cannot race another writer.
  if (await pathExists(filePath)) throw new CurationFileExistsError(filePath);
  await writeJsonAtomic(filePath, CurationProposalSchema, proposal);
}

/** `proposal.json`; absent unless the curation ended `proposed`. */
export async function readCurationProposal(location: CurationLocation): Promise<OptionalFile<CurationProposal>> {
  return readOptionalJsonFile(curationFilePath(location, 'proposal'), CurationProposalSchema);
}

/** Rewrites `cost.json` after a billed call (total = sum of sessions, checked by the schema). */
export async function writeCurationCost(location: CurationLocation, cost: CurationCostFile): Promise<void> {
  const filePath = curationFilePath(location, 'cost');
  assertSameCuration(filePath, location, cost.curationId);
  await writeJsonAtomic(filePath, CurationCostFileSchema, cost);
}

/** `cost.json`; absent until the first billed call. */
export async function readCurationCost(location: CurationLocation): Promise<OptionalFile<CurationCostFile>> {
  return readOptionalJsonFile(curationFilePath(location, 'cost'), CurationCostFileSchema);
}

/** Appends one event to `events.jsonl`; the file is never rewritten. */
export async function appendCurationEvent(location: CurationLocation, event: CurationEvent): Promise<void> {
  const filePath = curationFilePath(location, 'events');
  assertSameCuration(filePath, location, event.curationId);
  await appendJsonLine(filePath, CurationEventSchema, event);
}

/** Events from a byte offset; pass the returned `nextByte` on the next poll. */
export async function readCurationEvents(
  location: CurationLocation,
  fromByte = 0,
  maxBytes?: number,
): Promise<JsonLinesPage<CurationEvent>> {
  return readJsonLines(curationFilePath(location, 'events'), CurationEventSchema, fromByte, maxBytes);
}

/**
 * Appends one line to `session.jsonl`. The caller passes already-redacted text; this helper checks
 * shape, not secrecy (SPEC 0005 section 6).
 */
export async function appendCurationSessionLine(location: CurationLocation, line: CurationSessionLine): Promise<void> {
  await appendJsonLine(curationFilePath(location, 'session'), CurationSessionLineSchema, line);
}

export async function readCurationSessionLines(
  location: CurationLocation,
  fromByte = 0,
  maxBytes?: number,
): Promise<JsonLinesPage<CurationSessionLine>> {
  return readJsonLines(curationFilePath(location, 'session'), CurationSessionLineSchema, fromByte, maxBytes);
}

async function readFolderEntries(folder: string): Promise<Dirent[]> {
  try {
    return await readdir(folder, { withFileTypes: true });
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return [];
    throw error;
  }
}

/**
 * The curation ids under `curations/`, oldest first (ULID order). Only real folders named by a
 * ULID count: links, files and other names are ignored. A missing root lists nothing.
 */
export async function listCurationIds(curationsRoot: string): Promise<CurationId[]> {
  const entries = await readFolderEntries(checkedCurationsRoot(curationsRoot));
  const curationIds: CurationId[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const curationId = CurationIdSchema.safeParse(entry.name);
    if (curationId.success) curationIds.push(curationId.data);
  }
  return curationIds.sort();
}
