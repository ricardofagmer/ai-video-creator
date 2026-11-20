import { Module, type DynamicModule } from '@nestjs/common';
import { PathsModule } from '@studio/core/paths';
import { SchedulesReadModule } from '@studio/core/schedules';
import { BusyIntervalTracker } from './busy-interval.tracker';
import { CandidateSlotFirer } from './candidate-slot.firer';
import { ScheduleEventRecorder } from './schedule-event.recorder';
import { ScheduleScanner } from './schedule-scanner';
import { ScheduleStep } from './schedule-step';
import { ScheduledRunFiles } from './scheduled-run.files';
import { SlotLogWriter } from './slot-log.writer';

export interface WatcherScheduleModuleOptions {
  /**
   * The module that exports the engine's `CLOCK`: the daemon passes its own `WatcherModule`
   * registration (the same object, so the same instance), so schedules, runs and the heartbeat
   * share one clock and a test can move it.
   */
  clock: DynamicModule;
}

/**
 * The watcher's schedule step (SPEC 0006 R3-04, section 5.6). Core `SchedulesReadModule` gives the
 * read-only store over `schedules/`, the fired-run lookups, the guard facts (Prisma reads and the
 * month-to-date figure through `CostsReadModule`) and the pure `ScheduledRunFactory`; it registers
 * no command handler and no `ScheduleWriter`. The watcher's own writes are `cursor.json` and
 * `slots.jsonl` (`SlotLogWriter`) and the one `run.json` at `pending` per fired slot
 * (`ScheduledRunFiles`); nothing here writes SQLite, `schedule.json`, `approval.json` or
 * `control.json` (K1, K2, K3). Exports the step and the busy tracker for the daemon loop only.
 */
@Module({})
export class WatcherScheduleModule {
  static register(options: WatcherScheduleModuleOptions): DynamicModule {
    return {
      module: WatcherScheduleModule,
      imports: [options.clock, PathsModule, SchedulesReadModule],
      providers: [BusyIntervalTracker, ScheduleEventRecorder, ScheduleScanner, ScheduledRunFiles, SlotLogWriter, CandidateSlotFirer, ScheduleStep],
      exports: [ScheduleStep, BusyIntervalTracker],
    };
  }
}
