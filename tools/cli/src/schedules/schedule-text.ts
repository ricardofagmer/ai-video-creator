import type { ScheduleListView, ScheduleView } from '@studio/shared/api';
import type { Recurrence, SlotLine } from '@studio/shared/schedules';
import { cliText } from '../i18n/messages.js';
import { fitText, formatUsd } from '../output/format.js';
import { type ScheduleChange } from './schedule-gateway.js';
import { formatSlotLong, isoWeekdayLabel } from './slot-time.js';

export function recurrenceText(recurrence: Recurrence): string {
  const text = cliText().schedules.recurrence;
  switch (recurrence.kind) {
    case 'once':
      return text.once(recurrence.date, recurrence.time);
    case 'daily':
      return text.daily(recurrence.time);
    case 'weekly':
      return text.weekly(recurrence.weekdays.map((weekday) => isoWeekdayLabel(weekday) ?? String(weekday)).join(', '), recurrence.time);
    case 'monthly':
      return text.monthly(recurrence.dayOfMonth, recurrence.time);
  }
}

/** One slot line with its reason id in words (SPEC 0006 section 5.7); ids only, never brief text. */
export function slotLineText(line: SlotLine, timeZone: string): string {
  const text = cliText().schedules;
  const when = formatSlotLong(line.slotAt, timeZone);
  if (line.result === 'fired') return text.slot.fired(when, line.runId);
  const reason = line.reasonId === null ? text.slot.noReason : text.slotReasons[line.reasonId];
  return line.result === 'missed' ? text.slot.missed(when, reason) : text.slot.skipped(when, reason);
}

function nextText(view: ScheduleView): string {
  const next = view.next[0];
  return next === undefined ? '-' : formatSlotLong(next, view.timezone);
}

/** The column header of the schedule list, in the active language. */
export function scheduleListHeader(): string {
  const text = cliText().schedules.list;
  return `${fitText(text.headerId, 26)}  ${fitText(text.headerStatus, 9)}  ${fitText(text.headerRecipe, 22)}  ${fitText(text.headerNext, 18)}  ${fitText(text.headerMissed, 11)}  ${text.headerTitle}`;
}

export function scheduleListRow(view: ScheduleView): string {
  return [
    fitText(view.scheduleId, 26),
    fitText(cliText().schedules.statuses[view.status], 9),
    fitText(view.recipeRef, 22),
    fitText(nextText(view), 18),
    fitText(String(view.missedLast7Days), 11),
    view.title,
  ].join('  ');
}

export function scheduleListLines(views: ScheduleListView): string[] {
  if (views.length === 0) return [cliText().schedules.list.empty];
  return [scheduleListHeader(), ...views.map(scheduleListRow)];
}

function briefModeText(view: ScheduleView): string {
  const text = cliText().schedules.detail;
  const total = text.briefs(view.briefs.length);
  if (view.briefMode === 'repeat') return text.repeat(total);
  return text.queue(view.briefsRemaining ?? 0, total);
}

/** `studio schedules show <id>`: the detail the web shows, with brief ids and titles but never brief text. */
export function scheduleDetailLines(view: ScheduleView): string[] {
  const { statuses, detail: text } = cliText().schedules;
  const zone = view.timezone;
  const lines = [
    text.heading(view.scheduleId, view.title),
    text.status(statuses[view.status], formatSlotLong(view.statusSince, zone)),
    text.recipe(view.recipeRef),
    text.recurrence(recurrenceText(view.recurrence), zone),
    text.briefMode(briefModeText(view)),
    text.maxCost(formatUsd(view.costConsent.perRunUsd), formatUsd(view.worstCasePerMonthUsd)),
    text.missed(view.missedLast7Days),
  ];
  lines.push(view.next.length === 0 ? text.noNext : text.next);
  for (const instant of view.next) lines.push(`  ${formatSlotLong(instant, zone)}`);
  lines.push(view.slots.length === 0 ? text.noLatest : text.latest);
  for (const slot of view.slots) lines.push(`  ${slotLineText(slot, zone)}`);
  lines.push(text.briefsHeading);
  for (const brief of view.briefs) lines.push(`  ${brief.briefId}  ${fitText(brief.used ? text.used : text.unused, 7)}  ${brief.title ?? text.untitled}`);
  lines.push(text.stopsAtReview);
  return lines;
}

/** The confirmation of `studio schedules pause|resume|delete <id>`, from the view core returned. */
export function scheduleChangeLines(change: ScheduleChange, view: ScheduleView): string[] {
  const text = cliText().schedules;
  const lines = [text.changed(view.scheduleId, text.changes[change])];
  const next = view.next[0];
  if (change === 'resume' && next !== undefined) lines.push(text.nextSlot(formatSlotLong(next, view.timezone)));
  return lines;
}
