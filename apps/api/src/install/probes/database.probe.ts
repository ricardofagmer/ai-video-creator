import { lstat } from 'node:fs/promises';
import { Injectable, Logger } from '@nestjs/common';
import { DataHome } from '@studio/core/paths';
import { PrismaService } from '@studio/core/prisma';
import { type ComponentState } from '@studio/shared/api';

function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}

/**
 * SQLite: `missing` when the database file is absent, `degraded` when it exists but a constant
 * query fails, `ok` otherwise. The file is checked first, so the probe never reports a database
 * the client would have to create. Only error names are logged.
 */
@Injectable()
export class DatabaseProbe {
  private readonly logger = new Logger(DatabaseProbe.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dataHome: DataHome,
  ) {}

  async probe(): Promise<ComponentState> {
    try {
      const stats = await lstat(this.dataHome.databaseFile);
      if (!stats.isFile()) return 'degraded';
    } catch (error) {
      if (isNotFound(error)) return 'missing';
      this.logger.warn({ event: 'install.database-unreadable', errorName: error instanceof Error ? error.name : 'unknown' });
      return 'degraded';
    }
    try {
      // A constant tagged-template query: Prisma binds it; no input reaches it.
      await this.prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch (error) {
      this.logger.warn({ event: 'install.database-unavailable', errorName: error instanceof Error ? error.name : 'unknown' });
      return 'degraded';
    }
  }
}
