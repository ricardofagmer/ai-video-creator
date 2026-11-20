import { runStatusAppearance, type EventLevel, type EventLogItem } from '@studio/ui';
import { parseStepKey, type RunEvent } from '@studio/shared/run-format';
import { stageLabels } from '@/features/recipes/recipe-labels';
import { formatTime, stepLabels } from './run-labels';

/** design/telas/08 "Eventos (últimos 200 eventos; mais antigo em cima)". */
export const EVENT_LOG_LIMIT = 200;

const controlRequestLabels: Readonly<Record<'pause' | 'stop' | 'resume', string>> = {
  pause: 'pausar',
  stop: 'parar',
  resume: 'retomar',
};

function levelOf(event: RunEvent): EventLevel {
  if (event.level === 'error') return 'error';
  if (event.level === 'warning') return 'warning';
  return 'info';
}

function sourceOf(stepKey: string | null): string | undefined {
  if (stepKey === null) return undefined;
  try {
    const { stageId, step } = parseStepKey(stepKey);
    return `${stageLabels[stageId].toLowerCase()} · ${stepLabels[step].toLowerCase()}`;
  } catch {
    // The C3 schema already checked the key; an unparsable one only loses its source label.
    return undefined;
  }
}

/** A short pt-BR line for an event the watcher wrote without text. */
function fallbackMessage(event: RunEvent): string {
  switch (event.type) {
    case 'run.status':
      return `Status: ${runStatusAppearance[event.to].label}`;
    case 'control.request':
      return `Pedido de controle: ${controlRequestLabels[event.request]}`;
    case 'gate.waiting':
      return `Aguardando o portão ${event.gate}`;
    case 'gate.answered':
      return `Portão ${event.gate}: ${event.outcome === 'approved' ? 'aprovado' : 'recusado'}`;
    default:
      return event.type;
  }
}

/**
 * One EventLog row. `text` comes from the run folder and is untrusted (agent output may reach it):
 * it is passed on as a plain string and React renders it as text, never as HTML.
 */
export function toEventLogItem(event: RunEvent, sequence: number): EventLogItem {
  return {
    id: `event-${sequence}`,
    at: new Date(event.atMs).toISOString(),
    timeLabel: formatTime(event.atMs),
    level: levelOf(event),
    source: sourceOf(event.stepKey),
    message: event.text === '' ? fallbackMessage(event) : event.text,
  };
}

/** Appends a page and keeps the newest `EVENT_LOG_LIMIT` rows. */
export function appendEvents(current: readonly EventLogItem[], added: readonly EventLogItem[]): readonly EventLogItem[] {
  if (added.length === 0) return current;
  const merged = [...current, ...added];
  return merged.length > EVENT_LOG_LIMIT ? merged.slice(merged.length - EVENT_LOG_LIMIT) : merged;
}
