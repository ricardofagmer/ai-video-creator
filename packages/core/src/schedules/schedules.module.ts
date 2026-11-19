import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PathsModule } from '../paths/paths.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CreateScheduleHandler } from './commands/create-schedule.handler';
import { PatchScheduleHandler } from './commands/patch-schedule.handler';
import { GetScheduleHandler } from './queries/get-schedule.handler';
import { ListSchedulesHandler } from './queries/list-schedules.handler';
import { ScheduleRecipeGate } from './schedule-recipe.gate';
import { ScheduleRecipeReader } from './schedule-recipe.reader';
import { ScheduleStore } from './schedule-store';
import { ScheduleViewAssembler } from './schedule-view.assembler';
import { ScheduleWriter } from './schedule-writer';

/**
 * Schedules for the api and the CLI (SPEC 0006 section 5.5, C10 rev 5): create, pause, resume,
 * delete, add and remove briefs, get and list. The only writer of `schedule.json`; it never writes
 * `cursor.json`, `slots.jsonl`, a run or SQLite (recipes and the catalog are read through Prisma
 * reads). `ScheduleStore` is exported for the api's fired-run index sync, which reads new `fired`
 * lines (section 5.7). The composition root registers `CqrsModule.forRoot()`; the watcher imports
 * `SchedulesReadModule` instead.
 */
@Module({
  imports: [CqrsModule, PathsModule, PrismaModule],
  providers: [
    ScheduleStore,
    ScheduleWriter,
    ScheduleRecipeReader,
    ScheduleRecipeGate,
    ScheduleViewAssembler,
    CreateScheduleHandler,
    PatchScheduleHandler,
    GetScheduleHandler,
    ListSchedulesHandler,
  ],
  exports: [ScheduleStore],
})
export class SchedulesModule {}
