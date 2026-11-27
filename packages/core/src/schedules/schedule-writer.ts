import { Injectable } from '@nestjs/common';
import { type ScheduleFile } from '@studio/shared/schedules';
import { createSchedule, rewriteScheduleFile } from '@studio/shared/schedules/files';
import { DataHome } from '../paths/data-home';
import { SerialMutex } from '../runtime/keyed-mutex';

/**
 * The api's and CLI's only schedule writes (SPEC 0006 K2, R3-AC-19): `schedule.json` created
 * exclusively, then rewritten atomically. Provided by `SchedulesModule` only, never by
 * `SchedulesReadModule`, so the watcher's graph cannot reach it. It never writes `cursor.json` or
 * `slots.jsonl`.
 */
@Injectable()
export class ScheduleWriter {
  /** Read-check-write sequences (the limit count, a brief change) must not interleave in one process. */
  private readonly writes = new SerialMutex();

  constructor(private readonly dataHome: DataHome) {}

  /** Runs `work` after every earlier write of this process; each caller still gets its own result. */
  exclusive<T>(work: () => Promise<T>): Promise<T> {
    return this.writes.run(work);
  }

  /** SPEC 0006 section 5.5 step 6: the folder is created exclusively, status `active`. */
  create(file: ScheduleFile): Promise<void> {
    return createSchedule({ schedulesRoot: this.dataHome.schedules, scheduleId: file.scheduleId }, file);
  }

  /** Pause, resume, delete, add or remove briefs: one atomic rewrite of an existing file. */
  rewrite(file: ScheduleFile): Promise<void> {
    return rewriteScheduleFile({ schedulesRoot: this.dataHome.schedules, scheduleId: file.scheduleId }, file);
  }
}
