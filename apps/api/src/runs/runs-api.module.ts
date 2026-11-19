import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CostsModule } from '@studio/core/costs';
import { PathsModule } from '@studio/core/paths';
import { SchedulesApiModule } from '../schedules/schedules-api.module';
import { EmbeddingsApiModule } from '../search/embeddings-api.module';
import { MonthSpendReader } from './month-spend.reader';
import { RunArtifactAccessService } from './run-artifact-access.service';
import { RunArtifactReader } from './run-artifact.reader';
import { RunCursorReader } from './run-cursor.reader';
import { RunDecisionsController } from './run-decisions.controller';
import { RunIndexSync } from './run-index-sync.service';
import { RunLearningsController } from './run-learnings.controller';
import { RunStateReader } from './run-state.reader';
import { RunsController } from './runs.controller';

/**
 * Http side of runs. The handlers come from core `RunsModule`, `CostsModule`, `ReviewModule` and
 * `LearningsModule`, imported by the root; this module only reads run folders and dispatches
 * commands. `CostsModule` is imported for its exported `CostLedgerService` (month-to-date spend,
 * rev 4 A21); Nest shares the one module instance the root already imports. The rev 4 artifact
 * rule is exported for the comparison arms (SPEC 0003 section 5.3). `SchedulesApiModule` supplies
 * the fired-run index sync `GET /runs` runs first (SPEC 0006 section 5.7).
 */
@Module({
  imports: [CqrsModule, PathsModule, CostsModule, EmbeddingsApiModule, SchedulesApiModule],
  controllers: [RunsController, RunDecisionsController, RunLearningsController],
  providers: [RunStateReader, RunArtifactReader, RunArtifactAccessService, RunCursorReader, MonthSpendReader, RunIndexSync],
  exports: [RunArtifactAccessService],
})
export class RunsApiModule {}
