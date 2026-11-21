import { type Platform } from '../../metrics/enums';
import { writeJsonAtomic } from '../../run-files/atomic-write';
import { RunFileSchemaError } from '../../run-files/errors';
import { readOptionalJsonFile, type OptionalFile } from '../../run-files/read';
import {
  AccountFileSchema,
  GatesFileSchema,
  HealthFileSchema,
  type AccountFile,
  type GatesFile,
  type HealthFile,
} from '../connection-files';
import { ensureFolder } from './fs-helpers';
import { accountDirectory, accountFilePath, checkedPlatformRoot, gatesFilePath } from './paths';

/*
 * Writers (SPEC 0007 section 4.6, K2): `gates.json` and `account.json` only by the api or the CLI
 * (`writeGatesFile`, `writeAccountFile`); `health.json` only by the watcher (`writeHealthFile`).
 * These helpers cannot tell the processes apart; each caller imports only its own writers, which
 * inspection checks (AC 57). Every write is the C5 atomic tmp + rename.
 */

function assertPlatform(filePath: string, expected: Platform, found: Platform): void {
  if (expected !== found) throw new RunFileSchemaError(filePath, ['platform does not match the account folder']);
}

/** `gates.json`; absent until the owner first changes a gate, which reads as `defaultGates`. */
export async function readGatesFile(platformRoot: string): Promise<OptionalFile<GatesFile>> {
  return readOptionalJsonFile(gatesFilePath(platformRoot), GatesFileSchema);
}

/** The api's or CLI's gate change, after `applyGateChange` answered `applied`. */
export async function writeGatesFile(platformRoot: string, file: GatesFile): Promise<void> {
  await ensureFolder(checkedPlatformRoot(platformRoot));
  await writeJsonAtomic(gatesFilePath(platformRoot), GatesFileSchema, file);
}

/** `account.json`; absent until the platform is first connected. */
export async function readAccountFile(platformRoot: string, platform: Platform): Promise<OptionalFile<AccountFile>> {
  const filePath = accountFilePath(platformRoot, platform, 'account');
  const read = await readOptionalJsonFile(filePath, AccountFileSchema);
  if (read.status === 'present') assertPlatform(filePath, platform, read.value.platform);
  return read;
}

/** The api's or CLI's connect, reconnect or disconnect, under `token.lock` (section 5.2). */
export async function writeAccountFile(platformRoot: string, file: AccountFile): Promise<void> {
  await ensureFolder(accountDirectory(platformRoot, file.platform));
  await writeJsonAtomic(accountFilePath(platformRoot, file.platform, 'account'), AccountFileSchema, file);
}

/** `health.json`; absent until the watcher first checks the connection. */
export async function readHealthFile(platformRoot: string, platform: Platform): Promise<OptionalFile<HealthFile>> {
  const filePath = accountFilePath(platformRoot, platform, 'health');
  const read = await readOptionalJsonFile(filePath, HealthFileSchema);
  if (read.status === 'present') assertPlatform(filePath, platform, read.value.platform);
  return read;
}

/** The watcher's token health, backoff and last poll, written only between runs. */
export async function writeHealthFile(platformRoot: string, file: HealthFile): Promise<void> {
  await ensureFolder(accountDirectory(platformRoot, file.platform));
  await writeJsonAtomic(accountFilePath(platformRoot, file.platform, 'health'), HealthFileSchema, file);
}
