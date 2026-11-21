import { Inject, Injectable } from '@nestjs/common';
import {
  defaultGates,
  type AccountFile,
  type HealthFile,
  type Platform,
  type PlatformGates,
  type PollCursorFile,
} from '@studio/shared/platforms';
import { readAccountFile, readGatesFile, readHealthFile, readPollCursor } from '@studio/shared/platforms/files';
import { RunFileError, type OptionalFile } from '@studio/shared/run-files';
import { PlatformFileCorruptError } from '../platforms.errors';
import { PLATFORM_FILE_ROOT } from '../platform-runtime';

/*
 * Read-only access to the files under `<data home>/platform/` (SPEC 0007 sections 4.3 and 4.6).
 * Both the api module and the watcher's read module provide these; no method here writes. Writes
 * go through the shared helpers from the owning process only: `gates.json` and `account.json` from
 * the platform command handlers (api or CLI), `health.json` and `cursor.json` from the watcher.
 * A file that breaks its contract is `PlatformFileCorruptError`, never guessed.
 */

async function readChecked<T>(read: () => Promise<OptionalFile<T>>, corrupt: () => PlatformFileCorruptError): Promise<T | null> {
  try {
    const file = await read();
    return file.status === 'present' ? file.value : null;
  } catch (error) {
    if (error instanceof RunFileError) throw corrupt();
    throw error;
  }
}

/** Every platform's gates: `gates.json`, or `defaultGates` until the owner first changes one. */
@Injectable()
export class GateStore {
  constructor(@Inject(PLATFORM_FILE_ROOT) private readonly platformRoot: string) {}

  async readAll(): Promise<Readonly<Record<Platform, PlatformGates>>> {
    const file = await readChecked(() => readGatesFile(this.platformRoot), () => new PlatformFileCorruptError('gates.json', 'platform'));
    return file === null ? defaultGates : file.gates;
  }

  async read(platform: Platform): Promise<PlatformGates> {
    return (await this.readAll())[platform];
  }
}

/** `accounts/<platform>/account.json`, or null when the platform was never connected. */
@Injectable()
export class AccountStore {
  constructor(@Inject(PLATFORM_FILE_ROOT) private readonly platformRoot: string) {}

  async read(platform: Platform): Promise<AccountFile | null> {
    return readChecked(() => readAccountFile(this.platformRoot, platform), () => new PlatformFileCorruptError('account.json', platform));
  }

  /** The account only while it is `connected`. */
  async readConnected(platform: Platform): Promise<AccountFile | null> {
    const account = await this.read(platform);
    return account !== null && account.state === 'connected' ? account : null;
  }
}

/**
 * `accounts/<platform>/health.json` (watcher-written), and the poll cursor. A health file applies
 * only to the `connectionId` it names (`forConnection`).
 */
@Injectable()
export class HealthReader {
  constructor(@Inject(PLATFORM_FILE_ROOT) private readonly platformRoot: string) {}

  async read(platform: Platform): Promise<HealthFile | null> {
    return readChecked(() => readHealthFile(this.platformRoot, platform), () => new PlatformFileCorruptError('health.json', platform));
  }

  async forConnection(platform: Platform, connectionId: string): Promise<HealthFile | null> {
    const health = await this.read(platform);
    return health !== null && health.connectionId === connectionId ? health : null;
  }

  async readCursor(): Promise<PollCursorFile | null> {
    return readChecked(() => readPollCursor(this.platformRoot), () => new PlatformFileCorruptError('cursor.json', 'polls'));
  }
}
