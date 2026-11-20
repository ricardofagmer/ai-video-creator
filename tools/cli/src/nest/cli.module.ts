import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CatalogModule } from '@studio/core/catalog';
import { CostsModule } from '@studio/core/costs';
import { InsightsModule } from '@studio/core/insights';
import { MetricsModule } from '@studio/core/metrics';
import { PathsModule } from '@studio/core/paths';
import { PrismaModule } from '@studio/core/prisma';
import { QualityModule } from '@studio/core/quality';
import { RedactionModule } from '@studio/core/redaction';
import { ReviewModule } from '@studio/core/review';
import { RunsModule } from '@studio/core/runs';
import { SchedulesModule } from '@studio/core/schedules';
import { SeedModule } from '@studio/core/seed';
import { PassphraseHashRepository } from '../passphrase/passphrase-hash.repository.js';

/**
 * Composition root of the CLI's standalone Nest application context (SPEC 0002 R1-21, A2): the
 * same core command handlers the api boots, so SQLite has one set of writers (ADR 0003 "Who
 * writes what"). `CqrsModule.forRoot()` registers the buses once, as the core modules require.
 * No HTTP listener; the context lives for one command or one dashboard session. The one CLI-local
 * provider writes the passphrase hash row, which no core module owns. `QualityModule` backs
 * `studio catalog rescore` (SPEC 0003 R2-08); the embeddings module is not here: only the commands
 * that search or index by meaning boot it, through `CliSearchModule`. `MetricsModule` backs
 * `studio metrics import` and `SchedulesModule` the schedule commands and the status line (SPEC 0006
 * R3-07): the same handlers as the api, so `schedule.json` and the metrics tables keep their writers
 * and the CLI never writes `cursor.json` or `slots.jsonl` (ADR 0003).
 */
@Module({
  imports: [
    CqrsModule.forRoot(),
    PathsModule,
    PrismaModule,
    RedactionModule,
    CatalogModule,
    RunsModule,
    ReviewModule,
    SeedModule,
    CostsModule,
    QualityModule,
    MetricsModule,
    SchedulesModule,
    InsightsModule,
  ],
  providers: [PassphraseHashRepository],
})
export class CliModule {}
