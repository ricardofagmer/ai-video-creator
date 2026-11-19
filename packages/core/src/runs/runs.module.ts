import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CatalogModule } from '../catalog/catalog.module';
import { PathsModule } from '../paths/paths.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RecipesModule } from '../recipes/recipes.module';
import { CreateRunDraftHandler } from './commands/create-run-draft.handler';
import { DetachRunComparisonHandler } from './commands/detach-run-comparison.handler';
import { MarkRunPendingHandler } from './commands/mark-run-pending.handler';
import { RebuildRunIndexHandler } from './commands/rebuild-run-index.handler';
import { SyncRunIndexHandler } from './commands/sync-run-index.handler';
import { ListRunsHandler } from './queries/list-runs.handler';
import { RunDraftService } from './run-draft.service';
import { RunIndexRepository } from './run-index.repository';
import { RunIndexService } from './run-index.service';

/**
 * Runs before the watcher (ADR 0003 "Who writes what"), for the api and the CLI only: the draft
 * run.json, `draft` -> `pending`, and the SQLite run index rebuilt from run folders, with the
 * `comparisons` rows restored from linked arms (SPEC 0003). Nothing is exported; callers go
 * through the CQRS buses. The watcher never imports this module.
 */
@Module({
  imports: [CqrsModule, PathsModule, PrismaModule, CatalogModule, RecipesModule],
  providers: [
    RunIndexRepository,
    RunIndexService,
    RunDraftService,
    CreateRunDraftHandler,
    DetachRunComparisonHandler,
    MarkRunPendingHandler,
    RebuildRunIndexHandler,
    SyncRunIndexHandler,
    ListRunsHandler,
  ],
})
export class RunsModule {}
