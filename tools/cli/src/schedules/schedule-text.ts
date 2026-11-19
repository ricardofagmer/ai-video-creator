import type { ScheduleListView, ScheduleView } from '@studio/shared/api';
import type { Recurrence, ScheduleStatus, SlotLine, SlotMissedReason, SlotSkippedReason } from '@studio/shared/schedules';
import { fitText, formatUsd } from '../output/format.js';
import { type ScheduleChange } from './schedule-gateway.js';
import { ISO_WEEKDAY_LABELS, formatSlotLong } from './slot-time.js';

/** pt-BR labels of `ScheduleStatus`, as the web shows them. */
export const SCHEDULE_STATUS_LABELS: Readonly<Record<ScheduleStatus, string>> = {
  active: 'ativo',
  paused: 'pausado',
  deleted: 'excluído',
};

/** pt-BR text of every slot reason id (SPEC 0006 section 5.7); ids only, never brief text. */
const SLOT_REASON_LABELS: Readonly<Record<SlotMissedReason | SlotSkippedReason, string>> = {
  'watcher-not-running': 'o Mac estava desligado ou em repouso',
  'watcher-busy': 'o estúdio estava ocupado',
  'previous-run-open': 'a execução anterior ainda está aberta',
  'review-backlog': 'há execuções demais aguardando revisão',
  'brief-queue-empty': 'a fila de briefings está vazia',
  'month-spend-unavailable': 'o gasto do mês não pôde ser lido',
  'over-month-ceiling': 'o teto de gasto do mês foi atingido',
  'recipe-not-runnable': 'a receita não pode mais ser executada',
  'bindings-unresolvable': 'um vínculo ou referência não resolve mais',
  'schedule-unreadable': 'o agendamento não pôde ser lido',
  'internal-error': 'erro interno',
};

const changeConfirmations: Readonly<Record<ScheduleChange, string>> = {
  pause: 'pausado: nenhum horário dispara até "studio schedules resume".',
  resume: 'ativo: os horários do período pausado não disparam.',
  delete: 'excluído (final): nada mais dispara; a pasta fica como registro.',
};

/** `1 ativo`, `2 ativos`. */
export function countText(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function recurrenceText(recurrence: Recurrence): string {
  switch (recurrence.kind) {
    case 'once':
      return `uma vez, em ${recurrence.date} às ${recurrence.time}`;
    case 'daily':
      return `todo dia às ${recurrence.time}`;
    case 'weekly':
      return `toda semana (${recurrence.weekdays.map((weekday) => ISO_WEEKDAY_LABELS[weekday] ?? String(weekday)).join(', ')}) às ${recurrence.time}`;
    case 'monthly':
      return `todo mês no dia ${recurrence.dayOfMonth} às ${recurrence.time}`;
  }
}

export function slotLineText(line: SlotLine, timeZone: string): string {
  const when = formatSlotLong(line.slotAt, timeZone);
  if (line.result === 'fired') return `${when}  Disparada${line.runId === null ? '' : ` (execução ${line.runId})`}`;
  const reason = line.reasonId === null ? 'motivo não registrado' : SLOT_REASON_LABELS[line.reasonId];
  return `${when}  ${line.result === 'missed' ? 'Perdida' : 'Pulada'}: ${reason}`;
}

function nextText(view: ScheduleView): string {
  const next = view.next[0];
  return next === undefined ? '-' : formatSlotLong(next, view.timezone);
}

export const SCHEDULE_LIST_HEADER = `${fitText('ID', 26)}  ${fitText('STATUS', 9)}  ${fitText('RECEITA', 22)}  ${fitText('PRÓXIMA', 18)}  ${fitText('PERDIDAS 7d', 11)}  TÍTULO`;

export function scheduleListRow(view: ScheduleView): string {
  return [
    fitText(view.scheduleId, 26),
    fitText(SCHEDULE_STATUS_LABELS[view.status], 9),
    fitText(view.recipeRef, 22),
    fitText(nextText(view), 18),
    fitText(String(view.missedLast7Days), 11),
    view.title,
  ].join('  ');
}

export function scheduleListLines(views: ScheduleListView): string[] {
  if (views.length === 0) return ['Nenhum agendamento. Crie um pelo web, em Agendamentos.'];
  return [SCHEDULE_LIST_HEADER, ...views.map(scheduleListRow)];
}

function briefModeText(view: ScheduleView): string {
  const total = countText(view.briefs.length, 'briefing', 'briefings');
  if (view.briefMode === 'repeat') return `repetir (${total})`;
  return `fila, ${view.briefsRemaining ?? 0} de ${total} sem uso`;
}

/** `studio schedules show <id>`: the detail the web shows, with brief ids and titles but never brief text. */
export function scheduleDetailLines(view: ScheduleView): string[] {
  const zone = view.timezone;
  const lines = [
    `Agendamento ${view.scheduleId}: ${view.title}`,
    `Status: ${SCHEDULE_STATUS_LABELS[view.status]} desde ${formatSlotLong(view.statusSince, zone)}`,
    `Receita: ${view.recipeRef}`,
    `Recorrência: ${recurrenceText(view.recurrence)} (${zone})`,
    `Briefings: ${briefModeText(view)}`,
    `Custo máximo: ${formatUsd(view.costConsent.perRunUsd)} por execução, ${formatUsd(view.worstCasePerMonthUsd)} nos próximos 31 dias`,
    `Perdidas (7 dias): ${view.missedLast7Days}`,
  ];
  lines.push(view.next.length === 0 ? 'Próximos horários: nenhum (o agendamento não está ativo).' : 'Próximos horários:');
  for (const instant of view.next) lines.push(`  ${formatSlotLong(instant, zone)}`);
  lines.push(view.slots.length === 0 ? 'Últimos horários: nenhum decidido ainda.' : 'Últimos horários:');
  for (const slot of view.slots) lines.push(`  ${slotLineText(slot, zone)}`);
  lines.push('Briefings:');
  for (const brief of view.briefs) lines.push(`  ${brief.briefId}  ${fitText(brief.used ? 'usado' : 'sem uso', 7)}  ${brief.title ?? '(sem título)'}`);
  lines.push('Toda execução agendada para na revisão. Nada é publicado.');
  return lines;
}

/** The confirmation of `studio schedules pause|resume|delete <id>`, from the view core returned. */
export function scheduleChangeLines(change: ScheduleChange, view: ScheduleView): string[] {
  const lines = [`Agendamento ${view.scheduleId} ${changeConfirmations[change]}`];
  const next = view.next[0];
  if (change === 'resume' && next !== undefined) lines.push(`Próximo horário: ${formatSlotLong(next, view.timezone)}`);
  return lines;
}
