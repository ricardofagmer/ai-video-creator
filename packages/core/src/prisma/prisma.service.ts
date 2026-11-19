import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { DataHome, ensureDataHomeDirectories } from '../paths/data-home';
import { SQLITE_BUSY_TIMEOUT_MS, sqliteDatasourceUrl } from './sqlite-settings';

const JournalModeRowsSchema = z.array(z.object({ journal_mode: z.string() }).passthrough()).min(1);
const BusyTimeoutRowsSchema = z.array(z.record(z.string(), z.unknown())).min(1);

export class SqliteConfigurationError extends Error {
  readonly category = 'internal';

  constructor(readonly setting: 'journal_mode' | 'busy_timeout', readonly observed: string) {
    super(`SQLite ${setting} could not be applied (observed: ${observed})`);
    this.name = 'SqliteConfigurationError';
  }
}

/**
 * The single Prisma client of a process (ADR 0001). The datasource URL comes from the data-home
 * paths module, never from a literal path. On connect it sets WAL mode and the busy timeout.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly dataHome: DataHome) {
    super({ datasourceUrl: sqliteDatasourceUrl(dataHome.databaseFile) });
  }

  async onModuleInit(): Promise<void> {
    // SQLite creates the file but not its folder; the tables come only from `prisma migrate deploy`.
    await ensureDataHomeDirectories(this.dataHome);
    await this.$connect();
    await this.applyPragmas();
    this.logger.log({ event: 'database.connected', journalMode: 'wal', busyTimeoutMs: SQLITE_BUSY_TIMEOUT_MS });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  private async applyPragmas(): Promise<void> {
    // PRAGMA statements return a row, so they go through $queryRaw (SQLite refuses rows from
    // $executeRaw). The values are compile-time constants, never input.
    const journalRows = JournalModeRowsSchema.safeParse(await this.$queryRawUnsafe<unknown>('PRAGMA journal_mode = WAL'));
    const journalMode = journalRows.success ? journalRows.data[0]?.journal_mode.toLowerCase() : undefined;
    if (journalMode !== 'wal') throw new SqliteConfigurationError('journal_mode', journalMode ?? 'no result');

    if (!Number.isSafeInteger(SQLITE_BUSY_TIMEOUT_MS) || SQLITE_BUSY_TIMEOUT_MS <= 0) {
      throw new SqliteConfigurationError('busy_timeout', 'invalid constant');
    }
    const busyRows = BusyTimeoutRowsSchema.safeParse(
      await this.$queryRawUnsafe<unknown>(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`),
    );
    if (!busyRows.success) throw new SqliteConfigurationError('busy_timeout', 'no result');
  }
}
