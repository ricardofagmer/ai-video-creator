import { stat } from 'node:fs/promises';
import { Inject, Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit, type Provider } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { DataHome, ensureDataHomeDirectories } from '../paths/data-home';
import { SQLITE_BUSY_TIMEOUT_MS, sqliteDatasourceUrl } from './sqlite-settings';

const JournalModeRowsSchema = z.array(z.object({ journal_mode: z.string() }).passthrough()).min(1);
const BusyTimeoutRowsSchema = z.array(z.record(z.string(), z.unknown())).min(1);
const QueryOnlyRowsSchema = z.array(z.object({ query_only: z.union([z.number(), z.bigint(), z.boolean()]) }).passthrough()).min(1);

/**
 * How this process opens the database. `read-write` (the default: api, CLI) is unchanged. The
 * watcher binds `read-only` (ADR 0003 writer table: the watcher only reads SQLite): the connection
 * runs with `PRAGMA query_only = ON`, the journal mode is read and never set, and a missing database
 * file is an error instead of a new empty file.
 */
export type PrismaAccessMode = 'read-write' | 'read-only';

/** Optional token of the access mode; absent means `read-write`. */
export const PRISMA_ACCESS_MODE = Symbol('PRISMA_ACCESS_MODE');

export class SqliteConfigurationError extends Error {
  readonly category = 'internal';

  constructor(readonly setting: 'journal_mode' | 'busy_timeout' | 'query_only' | 'database_file', readonly observed: string) {
    super(`SQLite ${setting} could not be applied (observed: ${observed})`);
    this.name = 'SqliteConfigurationError';
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

/**
 * The single Prisma client of a process (ADR 0001). The datasource URL comes from the data-home
 * paths module, never from a literal path. On connect it sets WAL mode and the busy timeout, or in
 * `read-only` mode `query_only` and the busy timeout.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  /**
   * The token, reachable through the class the `@studio/core/prisma` entry point already exports,
   * so a composition root can bind `read-only` without a new export.
   */
  static readonly ACCESS_MODE = PRISMA_ACCESS_MODE;

  private readonly logger = new Logger(PrismaService.name);
  private readonly accessMode: PrismaAccessMode;

  constructor(
    private readonly dataHome: DataHome,
    @Optional() @Inject(PRISMA_ACCESS_MODE) accessMode?: PrismaAccessMode,
  ) {
    super({ datasourceUrl: sqliteDatasourceUrl(dataHome.databaseFile) });
    this.accessMode = accessMode ?? 'read-write';
  }

  /**
   * A global binding of `read-only` for a composition root that must never write SQLite (the
   * watcher). The api and CLI bind nothing and keep `read-write`.
   */
  static readOnlyAccessProvider(): Provider {
    return { provide: PRISMA_ACCESS_MODE, useValue: 'read-only' satisfies PrismaAccessMode };
  }

  async onModuleInit(): Promise<void> {
    // SQLite creates the file but not its folder; the tables come only from `prisma migrate deploy`.
    await ensureDataHomeDirectories(this.dataHome);
    if (this.accessMode === 'read-only') {
      await this.connectReadOnly();
      return;
    }
    await this.$connect();
    await this.applyPragmas();
    this.logger.log({ event: 'database.connected', journalMode: 'wal', busyTimeoutMs: SQLITE_BUSY_TIMEOUT_MS });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * The file must exist before the connection opens, since SQLite would create an empty one. The
   * check and the open are two steps; a file deleted in between is the one gap left, and
   * `query_only` still keeps the new file without tables or rows.
   */
  private async connectReadOnly(): Promise<void> {
    await this.assertDatabaseFileExists();
    await this.$connect();
    // Before any other statement: from here on this connection refuses every write.
    await this.$executeRawUnsafe('PRAGMA query_only = ON');
    const queryOnly = QueryOnlyRowsSchema.safeParse(await this.$queryRawUnsafe<unknown>('PRAGMA query_only'));
    const applied = queryOnly.success ? queryOnly.data[0]?.query_only : undefined;
    if (applied === undefined || !(applied === true || Number(applied) === 1)) {
      throw new SqliteConfigurationError('query_only', applied === undefined ? 'no result' : String(applied));
    }
    // Read, never set: setting the journal mode is a write to the database header.
    const journalRows = JournalModeRowsSchema.safeParse(await this.$queryRawUnsafe<unknown>('PRAGMA journal_mode'));
    const journalMode = journalRows.success ? journalRows.data[0]?.journal_mode.toLowerCase() : 'unknown';
    await this.applyBusyTimeout();
    this.logger.log({ event: 'database.connected', access: 'read-only', journalMode, busyTimeoutMs: SQLITE_BUSY_TIMEOUT_MS });
  }

  private async assertDatabaseFileExists(): Promise<void> {
    try {
      const info = await stat(this.dataHome.databaseFile);
      if (!info.isFile()) throw new SqliteConfigurationError('database_file', 'not a regular file');
    } catch (error) {
      if (hasErrorCode(error, 'ENOENT')) throw new SqliteConfigurationError('database_file', 'missing');
      throw error;
    }
  }

  private async applyPragmas(): Promise<void> {
    // PRAGMA statements return a row, so they go through $queryRaw (SQLite refuses rows from
    // $executeRaw). The values are compile-time constants, never input.
    const journalRows = JournalModeRowsSchema.safeParse(await this.$queryRawUnsafe<unknown>('PRAGMA journal_mode = WAL'));
    const journalMode = journalRows.success ? journalRows.data[0]?.journal_mode.toLowerCase() : undefined;
    if (journalMode !== 'wal') throw new SqliteConfigurationError('journal_mode', journalMode ?? 'no result');
    await this.applyBusyTimeout();
  }

  private async applyBusyTimeout(): Promise<void> {
    if (!Number.isSafeInteger(SQLITE_BUSY_TIMEOUT_MS) || SQLITE_BUSY_TIMEOUT_MS <= 0) {
      throw new SqliteConfigurationError('busy_timeout', 'invalid constant');
    }
    const busyRows = BusyTimeoutRowsSchema.safeParse(
      await this.$queryRawUnsafe<unknown>(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`),
    );
    if (!busyRows.success) throw new SqliteConfigurationError('busy_timeout', 'no result');
  }
}
