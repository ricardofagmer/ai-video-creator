import { type BadgeTone } from '@studio/ui';
import { type ScheduleView } from '@studio/shared/api';
import {
  scheduleBounds,
  type Recurrence,
  type ScheduleStatus,
  type SlotLine,
  type SlotMissedReason,
  type SlotResult,
  type SlotSkippedReason,
} from '@studio/shared/schedules';
import { formatIsoDate } from '@/features/metrics/metric-labels';

/*
 * pt-BR texts of the schedule screens (SPEC 0006 section 5.7). Times are shown in the schedule's own
 * time zone, the one its slots are defined in.
 */

export const scheduleStatusLabels: Readonly<Record<ScheduleStatus, string>> = {
  active: 'Ativo',
  paused: 'Pausado',
  deleted: 'Excluído',
};

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

/** Completes "Perdida: ..." or "Pulada: ..." for each reason of `slots.jsonl`. */
const slotReasonTexts: Readonly<Record<SlotMissedReason | SlotSkippedReason, string>> = {
  'watcher-not-running': 'o Mac estava desligado ou em repouso',
  'watcher-busy': 'o estúdio estava ocupado',
  'previous-run-open': 'a execução anterior deste agendamento ainda não terminou',
  'review-backlog': `já há ${scheduleBounds.maxOpenReviews} execuções deste agendamento esperando a sua revisão`,
  'brief-queue-empty': 'a fila de briefings acabou',
  'month-spend-unavailable': 'o gasto do mês não pôde ser lido',
  'over-month-ceiling': 'o gasto do mês chegou ao teto',
  'recipe-not-runnable': 'a receita não pode mais ser executada',
  'bindings-unresolvable': 'um vínculo ou uma referência da receita não existe mais',
  'schedule-unreadable': 'o arquivo do agendamento não pôde ser lido',
  'internal-error': 'ocorreu um erro interno',
};

/** "Disparada", "Perdida: o Mac estava desligado ou em repouso", "Pulada: {motivo}". */
export function slotLineText(line: SlotLine): string {
  if (line.result === 'fired') return 'Disparada';
  const reason = line.reasonId === null ? 'motivo não informado' : slotReasonTexts[line.reasonId];
  return line.result === 'missed' ? `Perdida: ${reason}` : `Pulada: ${reason}`;
}

/** ISO weekday 1 (Monday) to 7 (Sunday). */
export const weekdayShortLabels: Readonly<Record<number, string>> = {
  1: 'seg.',
  2: 'ter.',
  3: 'qua.',
  4: 'qui.',
  5: 'sex.',
  6: 'sáb.',
  7: 'dom.',
};

export const weekdayLongLabels: readonly { value: number; label: string }[] = [
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terça' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
];

/** "Uma vez em 25/11/2026 às 09:00", "Todo dia às 09:00", "Toda semana (seg., qua.) às 09:00", "Todo mês no dia 5 às 09:00". */
export function recurrenceText(recurrence: Recurrence): string {
  switch (recurrence.kind) {
    case 'once':
      return `Uma vez em ${formatIsoDate(recurrence.date)} às ${recurrence.time}`;
    case 'daily':
      return `Todo dia às ${recurrence.time}`;
    case 'weekly': {
      const days = [...recurrence.weekdays].sort((left, right) => left - right).map((day) => weekdayShortLabels[day] ?? String(day));
      return `Toda semana (${days.join(', ')}) às ${recurrence.time}`;
    }
    case 'monthly':
      return `Todo mês no dia ${recurrence.dayOfMonth} às ${recurrence.time}`;
  }
}

function slotParts(iso: string, timeZone: string, withYear: boolean): Readonly<Record<string, string>> {
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: withYear ? 'numeric' : undefined,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(new Date(iso))) parts[part.type] = part.value;
  return parts;
}

/** "qua., 25/11 09:00" (SPEC 0006 section 5.7), in the schedule's time zone. */
export function formatSlot(iso: string, timeZone: string): string {
  const parts = slotParts(iso, timeZone, false);
  return `${parts.weekday ?? ''}, ${parts.day ?? ''}/${parts.month ?? ''} ${parts.hour ?? ''}:${parts.minute ?? ''}`;
}

/** "qua., 25/11/2026 09:00" for the slot log, where entries can be months apart. */
export function formatSlotWithYear(iso: string, timeZone: string): string {
  const parts = slotParts(iso, timeZone, true);
  return `${parts.weekday ?? ''}, ${parts.day ?? ''}/${parts.month ?? ''}/${parts.year ?? ''} ${parts.hour ?? ''}:${parts.minute ?? ''}`;
}

/** "Próxima: qua., 25/11 09:00", or why there is none. */
export function nextSlotText(schedule: Pick<ScheduleView, 'next' | 'status' | 'timezone'>): string {
  const next = schedule.next[0];
  if (next !== undefined) return `Próxima: ${formatSlot(next, schedule.timezone)}`;
  return schedule.status === 'active' ? 'Próxima: nenhuma' : `Próxima: nenhuma (${scheduleStatusLabels[schedule.status].toLowerCase()})`;
}

/** "Perdidas (7 dias): 2". */
export function missedText(missedLast7Days: number): string {
  return `Perdidas (7 dias): ${missedLast7Days}`;
}

export function scheduleHref(scheduleId: string): string {
  return `/agendamentos/${encodeURIComponent(scheduleId)}`;
}

/** SPEC 0006 section 5.7: shown with every schedule creation; the plan gate is Q4. */
export const SCHEDULE_SAFETY_TEXT = 'Toda execução agendada para na revisão. Nada é publicado.';
export const PLAN_GATE_TEXT = 'Cada execução agendada também espera a sua aprovação do plano antes de gastar, como qualquer execução.';
