import { type PublishAttemptView } from '@studio/shared/api';
import { type RunPublicationLine } from '@studio/shared/platforms';
import { type EgressEntry, type ProviderName } from '@studio/shared/run-format';
import { cliText } from '../i18n/messages.js';
import { formatBytes, formatInstant } from '../output/format.js';
import { PLATFORM_LABELS } from './platform-labels.js';

/*
 * "O que saiu da máquina" of `studio runs show` (SPEC 0007 section 5.4, AC 49): the run's
 * `manifest.json.egress` first, then its `publications.jsonl` lines, oldest first, as the web
 * renders them. A line carries sizes, the visibility and asset refs only: no title, caption, tag,
 * URL, path or account label (K7).
 */

function providerLabel(provider: ProviderName): string {
  return cliText().platforms.leftTheMachine.providers[provider];
}

function platformName(line: { platform: RunPublicationLine['platform']; mode: RunPublicationLine['mode'] }): string {
  return line.mode === 'mock' ? `${PLATFORM_LABELS[line.platform]} (${cliText().platforms.modes.mock})` : PLATFORM_LABELS[line.platform];
}

function egressLine(entry: EgressEntry): string {
  return `  ${formatInstant(entry.at)} ${providerLabel(entry.provider)}: ${entry.summary}`;
}

/**
 * Section 5.4, for example "20/11/2026 10:02 YouTube: vídeo final enviado (84.0 MB), público; ativos
 * biométricos confirmados: voz-ricardo@3."
 */
export function publicationLineText(line: RunPublicationLine): string {
  const text = cliText().platforms;
  let sentence = `${text.leftTheMachine.events[line.event]} (${formatBytes(line.sizeBytes)}), ${text.visibilities[line.visibility]}`;
  if (line.biometricRefs.length > 0) sentence += text.leftTheMachine.biometricConfirmed(line.biometricRefs.join(', '));
  const reason = line.reasonId === null ? '' : ` ${text.publishFailures[line.reasonId]}`;
  return `${formatInstant(line.at)} ${platformName(line)}: ${sentence}.${reason}`;
}

/** The heading and every entry; one "nada" line when nothing left the machine. */
export function leftTheMachineLines(egress: readonly EgressEntry[], publications: readonly RunPublicationLine[]): string[] {
  const text = cliText().platforms.leftTheMachine;
  if (egress.length === 0 && publications.length === 0) return [text.heading, text.nothing];
  return [text.heading, ...egress.map(egressLine), ...publications.map((line) => `  ${publicationLineText(line)}`)];
}

function progressText(attempt: PublishAttemptView): string {
  if (attempt.state !== 'uploading' || attempt.bytesTotal === 0) return '';
  return cliText().platforms.leftTheMachine.progress(formatBytes(attempt.bytesSent), formatBytes(attempt.bytesTotal));
}

/** One attempt: id, platform, state and its reason text; never a title, caption, tag or URL. */
export function attemptLine(attempt: PublishAttemptView): string {
  const text = cliText().platforms;
  const state = text.leftTheMachine.since(text.publishStates[attempt.state], formatInstant(attempt.since));
  const head = `  ${attempt.attemptId} ${platformName(attempt)}: ${state}${progressText(attempt)}`;
  if (attempt.reasonId === null) return head;
  return `${head}. ${text.publishFailures[attempt.reasonId]} ${text.noResend}`;
}

/** The newest attempts of the run (at most 10, newest first, as the core view holds them). */
export function attemptLines(attempts: readonly PublishAttemptView[]): string[] {
  if (attempts.length === 0) return [];
  return [cliText().platforms.leftTheMachine.attemptsHeading, ...attempts.map(attemptLine)];
}
