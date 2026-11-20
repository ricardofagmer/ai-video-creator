import type { ScheduleListView, ScheduleView } from '@studio/shared/api';
import type { Printer } from '../output/printer.js';
import { type ScheduleGateway } from './schedule-gateway.js';
import { countText } from './schedule-text.js';
import { formatSlotShort } from './slot-time.js';

interface SoonestSlot {
  instant: string;
  timeZone: string;
}

function soonestSlot(views: readonly ScheduleView[]): SoonestSlot | null {
  let soonest: SoonestSlot | null = null;
  for (const view of views) {
    const next = view.next[0];
    if (next === undefined) continue;
    if (soonest === null || Date.parse(next) < Date.parse(soonest.instant)) soonest = { instant: next, timeZone: view.timezone };
  }
  return soonest;
}

/**
 * The `studio status` line of SPEC 0006 section 5.7: "Agendamentos: N ativos, próximo qua. 09:00,
 * M perdidos (7 dias)". The next slot is the soonest among active schedules, shown in its own
 * schedule's zone; the missed count adds every listed schedule's last 7 days.
 */
export function scheduleStatusLine(views: ScheduleListView): string {
  if (views.length === 0) return 'Agendamentos: nenhum';
  const active = views.filter((view) => view.status === 'active');
  const soonest = soonestSlot(active);
  const missed = views.reduce((total, view) => total + view.missedLast7Days, 0);
  const next = soonest === null ? 'sem próximo horário' : `próximo ${formatSlotShort(soonest.instant, soonest.timeZone)}`;
  return `Agendamentos: ${countText(active.length, 'ativo', 'ativos')}, ${next}, ${countText(missed, 'perdido', 'perdidos')} (7 dias)`;
}

export interface ScheduleStatusOptions {
  gateway: ScheduleGateway;
  printer: Printer;
  /** pt-BR text of a failure; the command boundary's error report in production. */
  describeError: (error: unknown) => string;
}

/** Status is a read: a schedule problem is a warning on stderr, never a failed status. */
export async function printScheduleStatus(options: ScheduleStatusOptions): Promise<void> {
  try {
    options.printer.line(scheduleStatusLine(await options.gateway.list()));
  } catch (error) {
    options.printer.error(`Aviso: agendamentos não lidos. ${options.describeError(error)}`);
  }
}
