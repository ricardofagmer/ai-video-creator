import { type PlatformView, type PlatformsView } from '@studio/shared/api';
import { capabilityStatusLabels } from '@studio/shared/platforms';
import { formatInstant } from '../output/format.js';
import {
  BACKOFF_REASON_TEXTS,
  CAPABILITY_LABELS,
  IMPORT_FALLBACK_TEXT,
  MOCK_MODE_TEXT,
  MODE_WORDS,
  PLATFORM_LABELS,
  RECONNECT_REASON_TEXTS,
  connectIsWebOnlyText,
} from './platform-labels.js';

/*
 * The platform lines of `studio platforms list`, `studio status` and the gate commands (SPEC 0007
 * sections 5.3 and 5.9). Status words are `capabilityStatusLabels`, verbatim, as on `/contas`. The
 * account label is shown here (it is the owner's own terminal) and is never logged.
 */

/** "YouTube (simulado)": the platform and the mode this process runs it in. */
export function platformHeading(view: PlatformView): string {
  return `${PLATFORM_LABELS[view.platform]} (${MODE_WORDS[view.mode]})`;
}

/** "Métricas: Conectada · Publicação: Publique no aplicativo e cole o link". */
export function capabilityStatusText(view: PlatformView): string {
  return `${CAPABILITY_LABELS.metrics}: ${capabilityStatusLabels[view.status.metrics]} · ${CAPABILITY_LABELS.publish}: ${capabilityStatusLabels[view.status.publish]}`;
}

function needsReconnect(view: PlatformView): boolean {
  return view.status.metrics === 'needs-reconnect' || view.status.publish === 'needs-reconnect';
}

/** The backoff sentence while it is still in force; null once `until` has passed. */
export function backoffText(view: PlatformView, now: Date): string | null {
  const backoff = view.backoff;
  if (backoff === null || Date.parse(backoff.until) <= now.getTime()) return null;
  return `Coleta pausada até ${formatInstant(backoff.until)} (${BACKOFF_REASON_TEXTS[backoff.reasonId]}).`;
}

/** One `studio status` line per platform (section 5.3: also shown in `studio status`). */
export function platformStatusLine(view: PlatformView, now: Date): string {
  const parts = [`${platformHeading(view)}: ${capabilityStatusText(view)}`];
  const backoff = backoffText(view, now);
  if (backoff !== null) parts.push(backoff);
  return parts.join(' · ');
}

/** The `studio status` block: one line per platform, then the reconnect hint when any needs it. */
export function platformStatusLines(views: PlatformsView, now: Date): string[] {
  const lines = ['Plataformas:', ...views.platforms.map((view) => `  ${platformStatusLine(view, now)}`)];
  if (views.platforms.some(needsReconnect)) lines.push('  Reconecte a conta pela página Contas do web; "studio platforms list" mostra o motivo.');
  return lines;
}

function accountLine(view: PlatformView): string {
  if (view.accountLabel === null) return '  Conta: nenhuma conectada';
  const since = view.connectedAt === null ? '' : ` desde ${formatInstant(view.connectedAt)}`;
  return `  Conta: ${view.accountLabel}${since}`;
}

function pollingLine(view: PlatformView): string {
  const last = view.lastPollAt === null ? 'nenhuma ainda' : formatInstant(view.lastPollAt);
  const tracked = view.trackedPublications === 1 ? '1 publicação acompanhada' : `${view.trackedPublications} publicações acompanhadas`;
  return `  Última coleta: ${last} · ${tracked}`;
}

/** One platform's block of `studio platforms list`, also printed after a gate change or disconnect. */
export function platformDetailLines(view: PlatformView, now: Date): string[] {
  const lines = [platformHeading(view), `  ${capabilityStatusText(view)}`, accountLine(view), pollingLine(view)];
  if (view.reconnectReason !== null) lines.push(`  Reconecte a conta: ${RECONNECT_REASON_TEXTS[view.reconnectReason]}`);
  const backoff = backoffText(view, now);
  if (backoff !== null) lines.push(`  ${backoff}`);
  if (view.mode === 'mock') lines.push(`  ${MOCK_MODE_TEXT}`);
  return lines;
}

/** `studio platforms list`: every platform, the import note of AC 44 and where connecting happens. */
export function platformListLines(views: PlatformsView, options: { now: Date; webPort: number }): string[] {
  const lines: string[] = [];
  for (const view of views.platforms) lines.push(...platformDetailLines(view, options.now), '');
  lines.push(IMPORT_FALLBACK_TEXT, connectIsWebOnlyText(options.webPort));
  return lines;
}
