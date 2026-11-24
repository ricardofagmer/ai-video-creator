import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InstallPlatformSchema, InstallVersionSchema, type InstallPlatform, type InstallVersion } from '@studio/shared/api';
import { z } from 'zod';
import { ApiConfig } from '../platform/api-config';
import { InstallPlatformUnsupportedError, InstallVersionUnavailableError } from './install.errors';

/**
 * The packaged manifest carries one hash per payload file (several megabytes for a full payload),
 * so the bound only stops a runaway read; the api's `package.json` is far below it.
 */
const MAX_VERSION_FILE_BYTES = 32 * 1024 * 1024;

const VersionFileSchema = z.object({ version: InstallVersionSchema }).passthrough();

/** `<process platform>-<arch>` mapped onto C1's closed list, or null for any other machine. */
export function installPlatformOf(platform: string, arch: string): InstallPlatform | null {
  const parsed = InstallPlatformSchema.safeParse(`${platform}-${arch}`);
  return parsed.success ? parsed.data : null;
}

/**
 * Nest token of the api package folder (`apps/api`, or `payload/api` when packaged). Both
 * `src/install` and `dist/install` sit two levels below it.
 */
export const INSTALL_API_PACKAGE_DIRECTORY = Symbol('INSTALL_API_PACKAGE_DIRECTORY');

export function defaultApiPackageDirectory(): string {
  return join(__dirname, '..', '..');
}

/**
 * The `version` and `platform` fields of presence and status. Packaged mode (C3 rev 2) reads
 * `<runtime>/payload/manifest.json`; development reads the api's `package.json`. Read once and
 * kept: the version cannot change while the process runs. Only error names are logged, since an
 * fs error message carries the path.
 */
@Injectable()
export class InstallIdentity {
  private readonly logger = new Logger(InstallIdentity.name);
  private version: Promise<InstallVersion> | null = null;

  constructor(
    private readonly config: ApiConfig,
    @Inject(INSTALL_API_PACKAGE_DIRECTORY) private readonly apiPackageDirectory: string,
  ) {}

  platform(): InstallPlatform {
    const platform = installPlatformOf(process.platform, process.arch);
    if (platform === null) throw new InstallPlatformUnsupportedError();
    return platform;
  }

  async installedVersion(): Promise<InstallVersion> {
    this.version ??= this.readVersion().catch((error: unknown) => {
      this.version = null;
      throw error;
    });
    return this.version;
  }

  private async readVersion(): Promise<InstallVersion> {
    const runtime = this.config.install.runtimeDirectory;
    const source = runtime === null ? join(this.apiPackageDirectory, 'package.json') : join(runtime, 'payload', 'manifest.json');
    try {
      const text = await readFile(source, { encoding: 'utf8', flag: 'r' });
      if (text.length > MAX_VERSION_FILE_BYTES) throw new InstallVersionUnavailableError();
      const content: unknown = JSON.parse(text);
      const parsed = VersionFileSchema.safeParse(content);
      if (!parsed.success) throw new InstallVersionUnavailableError();
      return parsed.data.version;
    } catch (error) {
      this.logger.error({ event: 'install.version-unreadable', errorName: error instanceof Error ? error.name : 'unknown' });
      throw new InstallVersionUnavailableError();
    }
  }
}
