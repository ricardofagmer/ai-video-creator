import { Module, type DynamicModule } from '@nestjs/common';
import { PrismaService } from '@studio/core/prisma';

/**
 * Binds core `PrismaService` to `read-only` for the whole daemon graph (ADR 0003 writer table, baseline
 * review): every core module imports the same `PrismaModule`, so the binding has to be global to reach
 * its one `PrismaService`. The connection then runs with `PRAGMA query_only = ON` and never creates a
 * missing database file; the api and CLI bind nothing and keep `read-write`.
 */
@Module({})
export class WatcherDatabaseAccessModule {
  static register(): DynamicModule {
    return {
      module: WatcherDatabaseAccessModule,
      global: true,
      providers: [PrismaService.readOnlyAccessProvider()],
      exports: [PrismaService.ACCESS_MODE],
    };
  }
}
