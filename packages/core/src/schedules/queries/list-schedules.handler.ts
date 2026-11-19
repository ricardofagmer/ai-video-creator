import { Logger } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { type ScheduleListView } from '@studio/shared/api';
import { scheduleBounds } from '@studio/shared/schedules';
import { ScheduleStore, type StoredSchedule } from '../schedule-store';
import { ScheduleViewAssembler } from '../schedule-view.assembler';
import { ScheduleFileCorruptError } from '../schedules.errors';
import { ListSchedulesQuery } from './list-schedules.query';

type ReadableSchedule = Extract<StoredSchedule, { state: 'readable' }>;

function isLive(stored: StoredSchedule): stored is ReadableSchedule {
  return stored.state === 'readable' && stored.file.status !== 'deleted';
}

/**
 * Reads only. At most `maxSchedules` are not `deleted`, so the list needs no pagination; the slice
 * keeps the C10 bound even if folders were added by hand. An unreadable schedule is left out and
 * logged by id (its own `GET` reports it).
 */
@QueryHandler(ListSchedulesQuery)
export class ListSchedulesHandler implements IQueryHandler<ListSchedulesQuery, ScheduleListView> {
  private readonly logger = new Logger(ListSchedulesHandler.name);

  constructor(
    private readonly store: ScheduleStore,
    private readonly assembler: ScheduleViewAssembler,
  ) {}

  async execute(): Promise<ScheduleListView> {
    const now = new Date();
    const live = (await this.store.listAll()).filter(isLive);
    const views: ScheduleListView = [];
    for (const stored of live.slice(0, scheduleBounds.maxSchedules)) {
      try {
        views.push(this.assembler.viewOf({ file: stored.file, slots: await this.store.summarizeSlots(stored.scheduleId, now), detail: 'list', now }));
      } catch (error) {
        if (!(error instanceof ScheduleFileCorruptError)) throw error;
        this.logger.warn({ event: 'schedule.list-skipped', scheduleId: stored.scheduleId, errorName: error.name });
      }
    }
    return views;
  }
}
