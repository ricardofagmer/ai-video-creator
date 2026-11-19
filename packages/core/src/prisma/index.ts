import { type Prisma } from '@prisma/client';

export { PrismaModule } from './prisma.module';
export { PrismaService, SqliteConfigurationError } from './prisma.service';
export {
  InvalidDatabasePathError,
  SQLITE_BUSY_TIMEOUT_MS,
  SQLITE_CONNECTION_LIMIT,
  sqliteDatasourceUrl,
} from './sqlite-settings';

/** The client inside `prisma.$transaction(async (tx) => ...)`; repositories accept it. */
export type PrismaTransaction = Prisma.TransactionClient;
