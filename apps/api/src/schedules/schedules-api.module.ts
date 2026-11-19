import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { SchedulesModule } from '@studio/core/schedules';
import { FiredRunIndexSync } from './fired-run-index.sync';
import { SchedulesController } from './schedules.controller';
import { SlotTailReader } from './slot-tail.reader';

/**
 * Http side of schedules (SPEC 0006 R3-05). The create, patch, get and list handlers come from core
 * `SchedulesModule`, imported by the root; it is imported here as well for its exported read-only
 * `ScheduleStore` (Nest shares the one module instance). `FiredRunIndexSync` is exported for
 * `GET /runs`. Nothing here writes `cursor.json`, `slots.jsonl` or a run file (ADR 0003, K2).
 */
@Module({
  imports: [CqrsModule, SchedulesModule],
  controllers: [SchedulesController],
  providers: [SlotTailReader, FiredRunIndexSync],
  exports: [FiredRunIndexSync],
})
export class SchedulesApiModule {}
