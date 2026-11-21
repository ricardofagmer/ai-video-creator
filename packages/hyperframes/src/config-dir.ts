import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { HYPERFRAMES_CONFIG_FILE_NAME } from '@studio/shared/hyperframes';

/*
 * Seeds `<data home>/hyperframes/config/config.json` before any HyperFrames process starts
 * (SPEC 0008 U2). The 0.9.72 CLI copies `~/.hyperframes/config.json` into HYPERFRAMES_CONFIG_DIR
 * only when that file is missing there (`seededConfigFile`, src/utils/configDir.ts), so a file
 * written here first keeps the owner's own settings out. HOME is also redirected, and the sandbox
 * denies the owner's folder, so this is the first of three barriers, not the only one.
 *
 * Content: telemetry off and its notice marked as shown. The CLI adds its own install ids to the
 * file on first read; that stays inside the studio's folder.
 */

const MINIMAL_CONFIG = `${JSON.stringify({ telemetryEnabled: false, telemetryNoticeShown: true }, null, 2)}\n`;

export type PrepareConfigOutcome = 'written' | 'present';

function isAlreadyThere(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST';
}

/** Writes the minimal `config.json` (`0600`, folder `0700`) only if absent; never overwrites. */
export async function prepareConfigDir(configDir: string): Promise<PrepareConfigOutcome> {
  await mkdir(configDir, { recursive: true, mode: 0o700 });
  try {
    // `wx` also refuses an existing symlink, so a planted link cannot redirect the write.
    await writeFile(join(configDir, HYPERFRAMES_CONFIG_FILE_NAME), MINIMAL_CONFIG, { flag: 'wx', mode: 0o600 });
    return 'written';
  } catch (error) {
    if (isAlreadyThere(error)) return 'present';
    throw error;
  }
}
