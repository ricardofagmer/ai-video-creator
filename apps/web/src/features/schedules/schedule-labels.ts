import { type BadgeTone, type Locale } from '@studio/ui';
import { type ScheduleView } from '@studio/shared/api';
import { type Recurrence, type ScheduleStatus, type SlotLine, type SlotResult } from '@studio/shared/schedules';
import { formatIsoDate, formatSlot } from '@/lib/i18n/format';
import { type WebMessages } from '@/messages';

/*
 * Texts of the schedule screens (SPEC 0006 section 5.7), built from `t.schedules` and the active
 * locale. Times are shown in the schedule's own time zone, the one its slots are defined in.
 */

type ScheduleTexts = WebMessages['schedules'];

export const scheduleStatusTones: Readonly<Record<ScheduleStatus, BadgeTone>> = {
  active: 'success',
  paused: 'warning',
  deleted: 'neutral',
};

export const slotResultTones: Readonly<Record<SlotResult, BadgeTone>> = {
  fired: 'success',
  missed: 'warning',
  skipped: 'neutral',
};

/** "Disparada", "Perdida: o Mac estava desligado ou em repouso", "Pulada: {motivo}". */
export function slotLineText(line: SlotLine, t: ScheduleTexts): string {
  if (line.result === 'fired') return t.slot.fired;
  const reason = line.reasonId === null ? t.slot.noReason : t.slotReasons[line.reasonId];
  return line.result === 'missed' ? t.slot.missed(reason) : t.slot.skipped(reason);
}

const weekdayFormatters = new Map<Locale, Intl.DateTimeFormat>();

/** `seg.` (pt-BR), `lun` (es), `Mon` (en) for an ISO weekday 1 (Monday) to 7 (Sunday). */
function weekdayShort(day: number, locale: Locale): string {
  let formatter = weekdayFormatters.get(locale);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
    weekdayFormatters.set(locale, formatter);
  }
  // 2024-01-01 was a Monday.
  return day >= 1 && day <= 7 ? formatter.format(new Date(Date.UTC(2024, 0, day))) : String(day);
}

/** "Uma vez em 25/11/2026 às 09:00", "Todo dia às 09:00", "Toda semana (seg., qua.) às 09:00", "Todo mês no dia 5 às 09:00". */
export function recurrenceText(recurrence: Recurrence, t: ScheduleTexts, locale: Locale): string {
  switch (recurrence.kind) {
    case 'once':
      return t.recurrence.once(formatIsoDate(recurrence.date, locale), recurrence.time);
    case 'daily':
      return t.recurrence.daily(recurrence.time);
    case 'weekly': {
      const days = [...recurrence.weekdays].sort((left, right) => left - right).map((day) => weekdayShort(day, locale));
      return t.recurrence.weekly(days.join(', '), recurrence.time);
    }
    case 'monthly':
      return t.recurrence.monthly(recurrence.dayOfMonth, recurrence.time);
  }
}

/** "Próxima: qua., 25/11 09:00", or why there is none. */
export function nextSlotText(schedule: Pick<ScheduleView, 'next' | 'status' | 'timezone'>, t: ScheduleTexts, locale: Locale): string {
  const next = schedule.next[0];
  if (next !== undefined) return t.next.at(formatSlot(next, schedule.timezone, locale));
  return schedule.status === 'active' ? t.next.none : t.next.noneWithStatus(t.statuses[schedule.status].toLocaleLowerCase(locale));
}

export function scheduleHref(scheduleId: string): string {
  return `/agendamentos/${encodeURIComponent(scheduleId)}`;
}
