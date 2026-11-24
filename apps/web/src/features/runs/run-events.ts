import { formatUsd, type EventLevel, type EventLogItem, type Locale, type UiMessages } from '@studio/ui';
import { parseStepKey, type RunEvent } from '@studio/shared/run-format';
import { formatDecimal } from '@/lib/i18n/format';
import { type WebMessages } from '@/messages';
import { formatTime } from './run-labels';

/** design/telas/08 "Eventos (últimos 200 eventos; mais antigo em cima)". */
export const EVENT_LOG_LIMIT = 200;

/** The texts and locale the EventLog rows are written in. */
export interface EventLogText {
  ui: UiMessages;
  runs: WebMessages['runs'];
  locale: Locale;
}

function levelOf(event: RunEvent): EventLevel {
  if (event.level === 'error') return 'error';
  if (event.level === 'warning') return 'warning';
  return 'info';
}

function sourceOf(stepKey: string | null, { runs, locale }: EventLogText): string | undefined {
  if (stepKey === null) return undefined;
  try {
    const { stageId, step } = parseStepKey(stepKey);
    return `${runs.stages[stageId].toLocaleLowerCase(locale)} · ${runs.steps[step].toLocaleLowerCase(locale)}`;
  } catch {
    // The C3 schema already checked the key; an unparsable one only loses its source label.
    return undefined;
  }
}

/** A short line for an event the watcher wrote without text. */
function fallbackMessage(event: RunEvent, { ui, runs }: EventLogText): string {
  switch (event.type) {
    case 'run.status':
      return runs.events.status(ui.status.run[event.to]);
    case 'control.request':
      return runs.events.controlRequest(runs.events.controlRequests[event.request]);
    case 'gate.waiting':
      return runs.events.gateWaiting(event.gate);
    case 'gate.answered':
      return runs.events.gateAnswered(event.gate, event.outcome === 'approved');
    default:
      return event.type;
  }
}

/**
 * The line of a structured event in the active locale (design.md section 3.3): everything it says
 * comes from typed fields. Null for a `log` event, whose text is recorded prose.
 */
function structuredMessage(event: RunEvent, { ui, runs, locale }: EventLogText): string | null {
  const texts = runs.eventTexts;
  switch (event.type) {
    case 'run.status':
      return texts.runStatus(event.from === null ? null : ui.status.run[event.from], ui.status.run[event.to]);
    case 'step.status':
      return texts.stepStatus(ui.status.step[event.status]);
    case 'step.recovery':
      return texts.stepRecovery(event.actionKind, event.resolved, event.needsPerson);
    case 'check.result':
      return texts.checkResult(runs.review.checks[event.checkId], texts.checkOutcomes[event.outcome]);
    case 'session.started':
      return texts.sessionStarted(event.role, event.modelId);
    case 'session.ended':
      return texts.sessionEnded(event.role, event.modelId, texts.sessionOutcomes[event.outcome], formatUsd(event.costUsd, locale));
    case 'review.verdict':
      return texts.reviewVerdict(runs.review.subjects[event.subject], formatDecimal(event.overall, locale, 1, true), event.retryRecommended);
    case 'gate.waiting':
    case 'gate.answered':
    case 'control.request':
      return fallbackMessage(event, { ui, runs, locale });
    case 'log':
      return null;
  }
}

/**
 * pt-BR shows the recorded line as the watcher wrote it. Other locales rebuild structured events
 * from their fields; a `log` line keeps its recorded (Portuguese) text, marked with its language.
 */
function messageOf(event: RunEvent, text: EventLogText): Pick<EventLogItem, 'message' | 'messageLang'> {
  if (event.text === '') return { message: fallbackMessage(event, text) };
  if (text.locale === 'pt-BR') return { message: event.text };
  const built = structuredMessage(event, text);
  return built === null ? { message: event.text, messageLang: 'pt-BR' } : { message: built };
}

/**
 * One EventLog row. `text` comes from the run folder and is untrusted (agent output may reach it):
 * it is passed on as a plain string and React renders it as text, never as HTML.
 */
export function toEventLogItem(event: RunEvent, sequence: number, text: EventLogText): EventLogItem {
  return {
    id: `event-${sequence}`,
    at: new Date(event.atMs).toISOString(),
    timeLabel: formatTime(event.atMs, text.locale),
    level: levelOf(event),
    source: sourceOf(event.stepKey, text),
    ...messageOf(event, text),
  };
}

/** Appends a page and keeps the newest `EVENT_LOG_LIMIT` rows. */
export function appendEvents(current: readonly EventLogItem[], added: readonly EventLogItem[]): readonly EventLogItem[] {
  if (added.length === 0) return current;
  const merged = [...current, ...added];
  return merged.length > EVENT_LOG_LIMIT ? merged.slice(merged.length - EVENT_LOG_LIMIT) : merged;
}
