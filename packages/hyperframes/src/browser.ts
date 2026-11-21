import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { HYPERFRAMES_CHROME_VERSION } from '@studio/shared/hyperframes';
import { prepareConfigDir } from './config-dir';
import { HyperframesChromeMissingError, HyperframesProcessFailedError } from './errors';
import { type HyperframesProcessPort } from './process-port';
import { buildBrowserEnsureArgv, buildBrowserEnsureEnv } from './render-command';
import { type HyperframesBaseRuntime } from './runtime';

/*
 * Chrome for HyperFrames (SPEC 0008 section 5.5, OD4 answer a). For `studio hyperframes chrome
 * install` only: `apps/watcher` never imports this module, and `renderPicture` never calls it, so
 * no render can download anything (K5, AC 69).
 */

/** The CLI keeps Chrome under `<HYPERFRAMES_CACHE_DIR>/chrome` (0.9.72 `CACHE_DIR`). */
const CHROME_CACHE_FOLDER = 'chrome';
const SHELL_FILE_NAME = 'chrome-headless-shell';
/** The download unpacks a few levels deep; the walk stops well beyond that. */
const MAX_DEPTH = 8;
const MAX_ENTRIES = 20_000;

/**
 * Seeds the config folder, then runs `<node> <bin> browser ensure` unsandboxed with the section
 * 4.5 environment minus `HYPERFRAMES_BROWSER_PATH`. The caller has shown the build, size, host and
 * destination and received the owner's typed confirmation before calling this.
 */
export async function ensureBrowser(runtime: HyperframesBaseRuntime, ports: { process: HyperframesProcessPort }): Promise<void> {
  await prepareConfigDir(runtime.configDir);
  const { command, args } = buildBrowserEnsureArgv(runtime);
  const { exitCode } = await ports.process.run({ command, args, cwd: runtime.homeDir, env: buildBrowserEnsureEnv(runtime) });
  if (exitCode !== 0) throw new HyperframesProcessFailedError('browser-ensure-failed', exitCode);
}

export interface InstalledChrome {
  version: typeof HYPERFRAMES_CHROME_VERSION;
  executablePath: string;
  sha256: string;
  sizeBytes: number;
}

interface ShellCandidate {
  absolutePath: string;
  pinned: boolean;
}

async function findShells(root: string): Promise<ShellCandidate[]> {
  const found: ShellCandidate[] = [];
  let visited = 0;
  const walk = async (folder: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH) return;
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      visited += 1;
      if (visited > MAX_ENTRIES) throw new HyperframesChromeMissingError('unreadable');
      const absolutePath = join(folder, entry.name);
      // Links are never followed: a link could point the hash, and the render, outside the cache.
      if (entry.isDirectory()) await walk(absolutePath, depth + 1);
      else if (entry.isFile() && entry.name === SHELL_FILE_NAME) {
        const segments = relative(root, absolutePath).split(sep);
        found.push({ absolutePath, pinned: segments.some((segment) => segment.includes(HYPERFRAMES_CHROME_VERSION)) });
      }
    }
  };
  try {
    await walk(root, 0);
  } catch (error) {
    if (error instanceof HyperframesChromeMissingError) throw error;
    // A missing or unreadable cache folder means no install to record.
    return [];
  }
  return found;
}

function sha256Of(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * The one `chrome-headless-shell` under a cache folder naming 158.0.8127.36, hashed (U3). Zero
 * matches, several, or any other version present is a failure: `chrome install` then writes
 * nothing and the engine stays off.
 */
export async function locateInstalledChrome(cacheDir: string): Promise<InstalledChrome> {
  const shells = await findShells(join(cacheDir, CHROME_CACHE_FOLDER));
  if (shells.length === 0) throw new HyperframesChromeMissingError('none');
  if (shells.length > 1) throw new HyperframesChromeMissingError('several');
  const [shell] = shells;
  if (shell === undefined || !shell.pinned) throw new HyperframesChromeMissingError('other-version');
  try {
    const stats = await lstat(shell.absolutePath);
    if (!stats.isFile() || stats.size <= 0) throw new HyperframesChromeMissingError('unreadable');
    return {
      version: HYPERFRAMES_CHROME_VERSION,
      executablePath: shell.absolutePath,
      sha256: await sha256Of(shell.absolutePath),
      sizeBytes: stats.size,
    };
  } catch (error) {
    if (error instanceof HyperframesChromeMissingError) throw error;
    throw new HyperframesChromeMissingError('unreadable');
  }
}
