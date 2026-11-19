import { Injectable } from '@nestjs/common';
import { type ScheduleBriefView, type ScheduleView } from '@studio/shared/api';
import { dueSlots, nextSlots, scheduleBounds, type ScheduleFile } from '@studio/shared/schedules';
import { type SlotLogSummary } from './slot-log-summary';

/** The "worst case per month" horizon of SPEC 0006 section 5.5 step 4. */
const WORST_CASE_HORIZON_MS = 31 * 24 * 60 * 60 * 1000;

/** `detail` carries brief bodies; `list` only ids and titles (C10 rev 5 `GET /schedules`). */
export type ScheduleViewDetail = 'detail' | 'list';

export interface ScheduleViewRequest {
  file: ScheduleFile;
  slots: SlotLogSummary;
  detail: ScheduleViewDetail;
  now: Date;
}

function roundCents(usd: number): number {
  return Math.round(usd * 100) / 100;
}

/**
 * Slots in the next 31 days times the per-run consent, from the recurrence alone, whatever the
 * status: the most the schedule can spend in a month once it is active.
 */
export function worstCasePerMonthUsd(file: ScheduleFile, now: Date): number {
  const slotCount = dueSlots(file, now, new Date(now.getTime() + WORST_CASE_HORIZON_MS)).length;
  return roundCents(slotCount * file.costConsent.perRunUsd);
}

/**
 * C10 rev 5 `ScheduleView` (SPEC 0006 sections 4.4 and 5.7) from `schedule.json` and the folded slot
 * log. `slots` is newest first; `next` is empty unless the schedule is `active`.
 */
@Injectable()
export class ScheduleViewAssembler {
  viewOf(request: ScheduleViewRequest): ScheduleView {
    const { file, slots, detail, now } = request;
    const { briefs, ...fields } = file;
    const briefViews = briefs.map(
      (brief): ScheduleBriefView => ({
        briefId: brief.briefId,
        title: brief.title ?? null,
        used: slots.usedBriefIds.has(brief.briefId),
        brief: detail === 'detail' ? brief.brief : null,
        references: detail === 'detail' ? [...brief.references] : null,
      }),
    );
    const next = file.status === 'active' ? nextSlots({ ...file, after: now, count: scheduleBounds.nextShown }) : [];
    return {
      ...fields,
      briefs: briefViews,
      next: next.map((slot) => slot.toISOString()),
      slots: slots.recent,
      missedLast7Days: slots.missedLast7Days,
      briefsRemaining: file.briefMode === 'queue' ? briefViews.filter((brief) => !brief.used).length : null,
      worstCasePerMonthUsd: worstCasePerMonthUsd(file, now),
    };
  }
}
