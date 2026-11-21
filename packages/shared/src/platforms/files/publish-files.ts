import { createHash } from 'node:crypto';
import { mkdir, rmdir } from 'node:fs/promises';
import { PublishAttemptIdSchema, type PublishAttemptId } from '../../common/ids';
import { writeJsonAtomic } from '../../run-files/atomic-write';
import { RunFileError, RunFileSchemaError, RunFileWriteError, hasErrorCode } from '../../run-files/errors';
import { readOptionalJsonFile, type OptionalFile } from '../../run-files/read';
import {
  PublishRequestFileSchema,
  PublishStateFileSchema,
  type PublishMetadata,
  type PublishRequestFile,
  type PublishStateFile,
} from '../publish-files';
import { formatProcessStamp, isStampAlive, parseProcessStamp, type ProcessStamp } from '../../run-files/process-identity';
import { createExclusive, ensureFolder, pathExists, readFolderEntries, readSmallFile } from './fs-helpers';
import { publishAttemptDirectory, publishFilePath, publishRoot } from './paths';

/*
 * Writers (SPEC 0007 section 4.6, K2, K4): `request.json` and `cancel` only by the api or the CLI
 * (`createPublishRequest` from `RequestPublish`, `createCancelMarker`); `claim` and `state.json` only
 * by the watcher (`claimPublishAttempt`, `writePublishState`), between runs. Each caller imports
 * only its own writers (AC 57, AC 58). No helper here removes a claim: a claimed attempt is never
 * uploaded again (K5).
 */

const ATTEMPT_FOLDER_MODE = 0o700;
const MAX_CLAIM_BYTES = 64;

/** A publish attempt folder that already exists: `request.json` is written once (K4). */
export class PublishAttemptExistsError extends RunFileError {
  override readonly code = 'write-failed';

  constructor(filePath: string) {
    super(`Publish attempt already exists: ${filePath}`, filePath);
    this.name = 'PublishAttemptExistsError';
  }
}

function assertSameAttempt(filePath: string, expected: PublishAttemptId, found: PublishAttemptId): void {
  if (expected !== found) throw new RunFileSchemaError(filePath, ['attemptId does not match the attempt folder']);
}

async function removeEmptyFolder(directory: string, writeError: unknown): Promise<void> {
  try {
    await rmdir(directory);
  } catch (cleanupError) {
    throw new RunFileWriteError(directory, {
      cause: new AggregateError([writeError, cleanupError], 'write failed and the new attempt folder was not removed'),
    });
  }
}

/**
 * `RequestPublish` step 9 (section 5.4): creates `publish/<attemptId>/` exclusively (an existing
 * folder throws `PublishAttemptExistsError`), then writes `request.json` once. On a failed write the
 * empty folder is removed and the error is rethrown, so the caller marks its row `failed`.
 */
export async function createPublishRequest(platformRoot: string, file: PublishRequestFile): Promise<void> {
  const directory = publishAttemptDirectory(platformRoot, file.attemptId);
  await ensureFolder(publishRoot(platformRoot));
  try {
    await mkdir(directory, { mode: ATTEMPT_FOLDER_MODE });
  } catch (error) {
    if (hasErrorCode(error, 'EEXIST')) throw new PublishAttemptExistsError(directory);
    throw new RunFileWriteError(directory, { cause: error });
  }
  try {
    await writeJsonAtomic(publishFilePath(platformRoot, file.attemptId, 'request'), PublishRequestFileSchema, file);
  } catch (error) {
    await removeEmptyFolder(directory, error);
    throw error;
  }
}

/** `request.json`; absent only while the api is creating the attempt. */
export async function readPublishRequest(platformRoot: string, attemptId: PublishAttemptId): Promise<OptionalFile<PublishRequestFile>> {
  const filePath = publishFilePath(platformRoot, attemptId, 'request');
  const read = await readOptionalJsonFile(filePath, PublishRequestFileSchema);
  if (read.status === 'present') assertSameAttempt(filePath, attemptId, read.value.attemptId);
  return read;
}

/**
 * `cancelled`: this call created the marker. `already-cancelled`: a marker exists. `claimed`: the
 * watcher already claimed the attempt and nothing was written (409 `publish-attempt-not-cancellable`).
 * The watcher checks `cancel` again right after it creates `claim`, so when the two race the
 * cancel wins and no byte is sent.
 */
export type CancelMarkerResult = 'cancelled' | 'already-cancelled' | 'claimed';

/** The api's or CLI's cancel (section 5.4): an empty O_EXCL marker, only while no `claim` exists. */
export async function createCancelMarker(platformRoot: string, attemptId: PublishAttemptId): Promise<CancelMarkerResult> {
  if (await pathExists(publishFilePath(platformRoot, attemptId, 'claim'))) return 'claimed';
  return (await createExclusive(publishFilePath(platformRoot, attemptId, 'cancel'), '')) ? 'cancelled' : 'already-cancelled';
}

export async function hasCancelMarker(platformRoot: string, attemptId: PublishAttemptId): Promise<boolean> {
  return pathExists(publishFilePath(platformRoot, attemptId, 'cancel'));
}

/**
 * The SHA-256 of the metadata the owner submitted (review finding F-3): `RequestPublish` stores it
 * in `publication_attempts.metadata_sha256` and the watcher compares it with `request.json` before an
 * upload, so a title, caption or tags edited outside the api are never published. The fields are
 * serialized in one fixed order, so the value never depends on key order in a file.
 */
export function publishMetadataSha256(metadata: PublishMetadata): string {
  const canonical = JSON.stringify([metadata.title, metadata.caption, metadata.tags, metadata.visibility, metadata.aiDisclosure]);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/** `claimed`: this process owns the upload. `taken`: a claim already exists. */
export type PublishClaimResult = 'claimed' | 'taken';

/**
 * The watcher's O_EXCL claim holding its pid and the boot it runs under (section 5.5, finding C1).
 * A claim is never removed.
 */
export async function claimPublishAttempt(platformRoot: string, attemptId: PublishAttemptId, pid: number): Promise<PublishClaimResult> {
  return (await createExclusive(publishFilePath(platformRoot, attemptId, 'claim'), formatProcessStamp(pid))) ? 'claimed' : 'taken';
}

/** The claimant's stamp, so the crash sweep can tell a live claimant from a dead one; null when unreadable. */
export async function readPublishClaim(
  platformRoot: string,
  attemptId: PublishAttemptId,
): Promise<{ status: 'absent' } | { status: 'present'; stamp: ProcessStamp | null }> {
  const read = await readSmallFile(publishFilePath(platformRoot, attemptId, 'claim'), MAX_CLAIM_BYTES);
  if (read.status === 'absent') return { status: 'absent' };
  return { status: 'present', stamp: read.status === 'present' ? parseProcessStamp(read.text) : null };
}

/**
 * Whether a claim's process still runs (finding C1): an unreadable claim, a claim from an earlier
 * boot, a pid of another user and `selfPid` itself are all dead.
 */
export function isPublishClaimantAlive(stamp: ProcessStamp | null, selfPid: number): boolean {
  return stamp !== null && isStampAlive(stamp, { selfPid });
}

/** The watcher's atomic rewrite of `state.json`; the caller checks `canTransitionPublishState` first. */
export async function writePublishState(platformRoot: string, file: PublishStateFile): Promise<void> {
  const directory = publishAttemptDirectory(platformRoot, file.attemptId);
  if (!(await pathExists(directory))) throw new RunFileWriteError(directory, { cause: new Error('attempt folder missing') });
  await writeJsonAtomic(publishFilePath(platformRoot, file.attemptId, 'state'), PublishStateFileSchema, file);
}

/** `state.json`; absent until the watcher first decides the attempt. */
export async function readPublishState(platformRoot: string, attemptId: PublishAttemptId): Promise<OptionalFile<PublishStateFile>> {
  const filePath = publishFilePath(platformRoot, attemptId, 'state');
  const read = await readOptionalJsonFile(filePath, PublishStateFileSchema);
  if (read.status === 'present') assertSameAttempt(filePath, attemptId, read.value.attemptId);
  return read;
}

/**
 * The attempt ids under `publish/`, oldest first (ULID order). Only real folders named by a ULID
 * count: links, files and other names are ignored. A missing folder lists nothing.
 */
export async function listPublishAttemptIds(platformRoot: string): Promise<PublishAttemptId[]> {
  const attemptIds: PublishAttemptId[] = [];
  for (const entry of await readFolderEntries(publishRoot(platformRoot))) {
    if (!entry.isDirectory()) continue;
    const attemptId = PublishAttemptIdSchema.safeParse(entry.name);
    if (attemptId.success) attemptIds.push(attemptId.data);
  }
  return attemptIds.sort();
}
