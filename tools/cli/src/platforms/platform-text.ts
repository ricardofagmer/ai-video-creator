import { type PlatformView, type PlatformsView } from '@studio/shared/api';
import { cliText } from '../i18n/messages.js';
import { formatInstant } from '../output/format.js';
import { PLATFORM_LABELS } from './platform-labels.js';

/*
 * The platform lines of `studio platforms list`, `studio status` and the gate commands (SPEC 0007
 * sections 5.3 and 5.9). Status words are the catalogue's `capabilityStatus` (in pt-BR the shared
 * `capabilityStatusLabels`, verbatim, as on `/contas`). The account label is shown here (it is the
 * owner's own terminal) and is never logged.
 */

/** "YouTube (simulado)": the platform and the mode this process runs it in. */
export function platformHeading(view: PlatformView): string {
  const text = cliText().platforms;
  return text.text.heading(PLATFORM_LABELS[view.platform], text.modes[view.mode]);
}

/** "Métricas: Conectada · Publicação: Publique no aplicativo e cole o link". */
export function capabilityStatusText(view: PlatformView): string {
  const { capabilities, capabilityStatus } = cliText().platforms;
  return `${capabilities.metrics}: ${capabilityStatus[view.status.metrics]} · ${capabilities.publish}: ${capabilityStatus[view.status.publish]}`;
}

function needsReconnect(view: PlatformView): boolean {
  return view.status.metrics === 'needs-reconnect' || view.status.publish === 'needs-reconnect';
}

/** The backoff sentence while it is still in force; null once `until` has passed. */
export function backoffText(view: PlatformView, now: Date): string | null {
  const backoff = view.backoff;
  if (backoff === null || Date.parse(backoff.until) <= now.getTime()) return null;
  const text = cliText().platforms;
  return text.text.backoff(formatInstant(backoff.until), text.backoffReasons[backoff.reasonId]);
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
  const text = cliText().platforms.text;
  const lines = [text.statusHeading, ...views.platforms.map((view) => `  ${platformStatusLine(view, now)}`)];
  if (views.platforms.some(needsReconnect)) lines.push(text.reconnectHint);
  return lines;
}

function accountLine(view: PlatformView): string {
  const text = cliText().platforms.text;
  if (view.accountLabel === null) return text.noAccount;
  return text.account(view.accountLabel, view.connectedAt === null ? null : formatInstant(view.connectedAt));
}

function pollingLine(view: PlatformView): string {
  const text = cliText().platforms.text;
  const last = view.lastPollAt === null ? text.noPollYet : formatInstant(view.lastPollAt);
  return text.polling(last, text.tracked(view.trackedPublications));
}

/** One platform's block of `studio platforms list`, also printed after a gate change or disconnect. */
export function platformDetailLines(view: PlatformView, now: Date): string[] {
  const text = cliText().platforms;
  const lines = [platformHeading(view), `  ${capabilityStatusText(view)}`, accountLine(view), pollingLine(view)];
  if (view.reconnectReason !== null) lines.push(text.text.reconnect(text.reconnectReasons[view.reconnectReason]));
  const backoff = backoffText(view, now);
  if (backoff !== null) lines.push(`  ${backoff}`);
  if (view.mode === 'mock') lines.push(`  ${text.mockMode}`);
  return lines;
}

/** `studio platforms list`: every platform, the import note of AC 44 and where connecting happens. */
export function platformListLines(views: PlatformsView, options: { now: Date; webPort: number }): string[] {
  const text = cliText().platforms;
  const lines: string[] = [];
  for (const view of views.platforms) lines.push(...platformDetailLines(view, options.now), '');
  lines.push(text.importFallback, text.connectIsWebOnly(options.webPort));
  return lines;
}
