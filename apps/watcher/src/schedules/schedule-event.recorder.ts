import { Injectable, Logger } from '@nestjs/common';
import { type RunId } from '@studio/shared/run-format';
import { type ScheduleId, type SlotMissedReason, type SlotResult, type SlotSkippedReason } from '@studio/shared/schedules';

/**
 * The watcher's schedule events (SPEC 0006 section 7) and the operational lines around them. Every
 * field is an id, an ISO instant, a result, a reason id, a count or an error class name (K7): never
 * brief text, a title, a path or an error message.
 */
export type ScheduleEvent =
  | {
      type: 'schedule.slot';
      scheduleId: ScheduleId;
      slotAt: string;
      result: SlotResult;
      reasonId: SlotMissedReason | SlotSkippedReason | null;
      runId: RunId | null;
      latenessMs: number;
    }
  | { type: 'schedule.evaluate-failed'; scheduleId: ScheduleId; error: string }
  | { type: 'schedule.evaluate-recovered'; scheduleId: ScheduleId }
  /** A `run.json` written for the slot before a crash was found; only its `fired` line was added. */
  | { type: 'schedule.slot-recovered'; scheduleId: ScheduleId; slotAt: string; runId: RunId }
  | { type: 'schedule.unreadable'; scheduleId: ScheduleId; reasonId: Extract<SlotSkippedReason, 'schedule-unreadable'> }
  | { type: 'schedules.scan-failed'; error: string }
  | { type: 'schedules.scan-recovered' };

type LogLevel = 'log' | 'warn' | 'error';

const levelOf: Readonly<Record<ScheduleEvent['type'], LogLevel>> = {
  'schedule.slot': 'log',
  'schedule.evaluate-failed': 'error',
  'schedule.evaluate-recovered': 'log',
  'schedule.slot-recovered': 'warn',
  'schedule.unreadable': 'warn',
  'schedules.scan-failed': 'error',
  'schedules.scan-recovered': 'log',
};

/** Writes schedule events to the daemon log (`logs/watcher.log`), the home of watcher events. */
@Injectable()
export class ScheduleEventRecorder {
  private readonly logger = new Logger(ScheduleEventRecorder.name);

  record(event: ScheduleEvent): void {
    const { type, ...fields } = event;
    const line = { event: type, ...fields };
    switch (levelOf[type]) {
      case 'log':
        this.logger.log(line);
        return;
      case 'warn':
        this.logger.warn(line);
        return;
      case 'error':
        this.logger.error(line);
        return;
    }
  }
}
