import { lstat } from 'node:fs/promises';
import { Injectable, Logger } from '@nestjs/common';
import { DATA_HOME_DIRECTORY_MODE, DataHome } from '@studio/core/paths';
import { type ComponentState } from '@studio/shared/api';

type FolderCheck = 'ok' | 'absent' | 'not-a-folder' | 'too-open';

/** Permission bits beyond the owner's; any of them set means the folder is readable by others. */
const NON_OWNER_BITS = 0o777 & ~DATA_HOME_DIRECTORY_MODE;

function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}

async function checkFolder(folder: string, checkMode: boolean): Promise<FolderCheck> {
  try {
    const stats = await lstat(folder);
    if (!stats.isDirectory()) return 'not-a-folder';
    if (checkMode && (stats.mode & NON_OWNER_BITS) !== 0) return 'too-open';
    return 'ok';
  } catch (error) {
    if (isNotFound(error)) return 'absent';
    throw error;
  }
}

/**
 * The data home of D5: `missing` when its root is absent, `degraded` when a folder the processes
 * create at start (`ensureDataHomeDirectories`) is absent, is not a plain folder, or is open to
 * other users (macOS; Windows has no such mode bits), `ok` otherwise. `models/` is not checked:
 * it exists only once the optional search model is fetched.
 */
@Injectable()
export class DataHomeProbe {
  private readonly logger = new Logger(DataHomeProbe.name);

  constructor(private readonly dataHome: DataHome) {}

  async probe(): Promise<ComponentState> {
    const checkMode = process.platform !== 'win32';
    const home = this.dataHome;
    try {
      const root = await checkFolder(home.root, checkMode);
      if (root === 'absent') return 'missing';
      if (root !== 'ok') return 'degraded';
      const folders = [home.db, home.assets, home.runs, home.logs, home.curations, home.schedules, home.platform];
      const checks = await Promise.all(folders.map((folder) => checkFolder(folder, checkMode)));
      return checks.every((check) => check === 'ok') ? 'ok' : 'degraded';
    } catch (error) {
      this.logger.warn({ event: 'install.data-home-unreadable', errorName: error instanceof Error ? error.name : 'unknown' });
      return 'degraded';
    }
  }
}
