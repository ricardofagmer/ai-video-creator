/**
 * How long a connection waits on a SQLite lock before failing with SQLITE_BUSY (ADR 0001: WAL plus
 * a busy timeout cover the rare overlap of the api and the CLI writing at once).
 */
export const SQLITE_BUSY_TIMEOUT_MS = 5000;

/**
 * One connection per process: SQLite admits one writer at a time anyway, and a single connection
 * guarantees the per-connection `PRAGMA busy_timeout` applies to every query.
 */
export const SQLITE_CONNECTION_LIMIT = 1;

export class InvalidDatabasePathError extends Error {
  readonly category = 'internal';

  constructor() {
    super('The database path cannot be expressed as a SQLite connection URL (absolute path without ? or #)');
    this.name = 'InvalidDatabasePathError';
  }
}

/**
 * Prisma SQLite URL for the data-home database file. `socket_timeout` is Prisma's SQLite lock
 * wait in seconds; the explicit PRAGMA in PrismaService sets the same bound in milliseconds.
 */
export function sqliteDatasourceUrl(databaseFile: string): string {
  if (!databaseFile.startsWith('/') || /[?#]/.test(databaseFile) || databaseFile.includes('\u0000')) {
    throw new InvalidDatabasePathError();
  }
  const lockWaitSeconds = Math.ceil(SQLITE_BUSY_TIMEOUT_MS / 1000);
  return `file:${databaseFile}?connection_limit=${SQLITE_CONNECTION_LIMIT}&socket_timeout=${lockWaitSeconds}`;
}
