import { Module } from '@nestjs/common';
import { CostsReadModule } from '../costs/costs-read.module';
import { PathsModule } from '../paths/paths.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ScheduleRecipeReader } from './schedule-recipe.reader';
import { ScheduleRunsReader } from './schedule-runs.reader';
import { ScheduleStore } from './schedule-store';
import { ScheduledRunFactory } from './scheduled-run.factory';
import { SlotFactsCollector } from './slot-facts.collector';

/**
 * Read side of the schedule module for the watcher (SPEC 0006 section 5.6, ADR 0003 as amended):
 * the read-only store over `schedules/`, the fired-run and recipe lookups, the guard facts (month to
 * date through `CostsReadModule`'s `CostLedgerService`) and `ScheduledRunFactory`, which builds the
 * `pending` run the watcher writes once. It registers no command or query handler, provides no
 * `ScheduleWriter`, and nothing it provides writes SQLite, `schedule.json` or a run file; the watcher
 * writes `cursor.json`, `slots.jsonl` and the one `run.json` in its own scope. The api imports
 * `SchedulesModule` instead.
 */
@Module({
  imports: [PathsModule, PrismaModule, CostsReadModule],
  providers: [ScheduleStore, ScheduleRecipeReader, ScheduleRunsReader, SlotFactsCollector, ScheduledRunFactory],
  exports: [ScheduleStore, ScheduleRunsReader, SlotFactsCollector, ScheduledRunFactory],
})
export class SchedulesReadModule {}
