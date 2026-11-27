import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { type ComponentState } from '@studio/shared/api';
import { ApiConfig, type InstallEnvironment } from '../../platform/api-config';
import { INSTALL_HOME_DIRECTORY } from '../install-runtime';

/** Playwright names each installed Chromium build `chromium-<revision>`. */
const CHROMIUM_FOLDER_PATTERN = /^chromium-\d+$/;

/** Playwright's default browser cache per OS, relative to the home folder. */
const DEFAULT_CACHE_SEGMENTS: Readonly<Record<string, readonly string[]>> = {
  darwin: ['Library', 'Caches', 'ms-playwright'],
  win32: ['AppData', 'Local', 'ms-playwright'],
  linux: ['.cache', 'ms-playwright'],
};

/** Where Playwright keeps its browsers: `PLAYWRIGHT_BROWSERS_PATH` when set, else its default cache. */
export function playwrightBrowsersDirectory(install: InstallEnvironment, homeDirectory: string, platform: string): string | null {
  if (install.playwrightBrowsersDirectory !== null) return install.playwrightBrowsersDirectory;
  const segments = DEFAULT_CACHE_SEGMENTS[platform];
  return segments === undefined ? null : join(homeDirectory, ...segments);
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}

/**
 * The optional Chromium the capture tools drive (install step 9, first-run step 5). Presence only:
 * a `chromium-<revision>` folder in Playwright's browser folder is `ok`, none is `not-installed`,
 * an unreadable folder is `degraded`. The browser is never launched here.
 */
@Injectable()
export class CaptureBrowserProbe {
  private readonly logger = new Logger(CaptureBrowserProbe.name);

  constructor(
    private readonly config: ApiConfig,
    @Inject(INSTALL_HOME_DIRECTORY) private readonly homeDirectory: string,
  ) {}

  async probe(): Promise<ComponentState> {
    const folder = playwrightBrowsersDirectory(this.config.install, this.homeDirectory, process.platform);
    if (folder === null) return 'not-installed';
    try {
      const entries = await readdir(folder, { withFileTypes: true });
      return entries.some((entry) => entry.isDirectory() && CHROMIUM_FOLDER_PATTERN.test(entry.name)) ? 'ok' : 'not-installed';
    } catch (error) {
      if (isNotFound(error)) return 'not-installed';
      this.logger.warn({ event: 'install.capture-browser-unreadable', errorName: error instanceof Error ? error.name : 'unknown' });
      return 'degraded';
    }
  }
}
