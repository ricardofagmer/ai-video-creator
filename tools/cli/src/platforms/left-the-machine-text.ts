import { type PublishAttemptView } from '@studio/shared/api';
import { type RunPublicationLine } from '@studio/shared/platforms';
import { type EgressEntry, type ProviderName } from '@studio/shared/run-format';
import { formatBytes, formatInstant } from '../output/format.js';
import { MODE_WORDS, NO_RESEND_TEXT, PLATFORM_LABELS, PUBLISH_FAILURE_TEXTS, PUBLISH_STATE_LABELS, VISIBILITY_WORDS } from './platform-labels.js';

/*
 * "O que saiu da máquina" of `studio runs show` (SPEC 0007 section 5.4, AC 49): the run's
 * `manifest.json.egress` first, then its `publications.jsonl` lines, oldest first, as the web
 * renders them. A line carries sizes, the visibility and asset refs only: no title, caption, tag,
 * URL, path or account label (K7).
 */

export const LEFT_THE_MACHINE_HEADING = 'O que saiu da máquina:';

const providerLabels: Readonly<Record<ProviderName, string>> = {
  claude: 'Claude',
  elevenlabs: 'ElevenLabs',
  'local-voice': 'Voz local',
  capture: 'Captura de página',
  render: 'Renderização',
};

const eventPhrases: Readonly<Record<RunPublicationLine['event'], string>> = {
  'upload-started': 'envio do vídeo final iniciado',
  published: 'vídeo final enviado',
  'sent-to-inbox': 'vídeo final enviado para a caixa de entrada',
  failed: 'envio do vídeo final falhou',
  'outcome-unknown': 'vídeo final enviado sem confirmação',
};

function platformName(line: { platform: RunPublicationLine['platform']; mode: RunPublicationLine['mode'] }): string {
  return line.mode === 'mock' ? `${PLATFORM_LABELS[line.platform]} (${MODE_WORDS.mock})` : PLATFORM_LABELS[line.platform];
}

function egressLine(entry: EgressEntry): string {
  return `  ${formatInstant(entry.at)} ${providerLabels[entry.provider]}: ${entry.summary}`;
}

/**
 * Section 5.4, for example "20/11/2026 10:02 YouTube: vídeo final enviado (84.0 MB), público; ativos
 * biométricos confirmados: voz-ricardo@3."
 */
export function publicationLineText(line: RunPublicationLine): string {
  let sentence = `${eventPhrases[line.event]} (${formatBytes(line.sizeBytes)}), ${VISIBILITY_WORDS[line.visibility]}`;
  if (line.biometricRefs.length > 0) sentence += `; ativos biométricos confirmados: ${line.biometricRefs.join(', ')}`;
  const reason = line.reasonId === null ? '' : ` ${PUBLISH_FAILURE_TEXTS[line.reasonId]}`;
  return `${formatInstant(line.at)} ${platformName(line)}: ${sentence}.${reason}`;
}

/** The heading and every entry; one "nada" line when nothing left the machine. */
export function leftTheMachineLines(egress: readonly EgressEntry[], publications: readonly RunPublicationLine[]): string[] {
  if (egress.length === 0 && publications.length === 0) return [LEFT_THE_MACHINE_HEADING, '  Nada saiu da máquina nesta execução.'];
  return [LEFT_THE_MACHINE_HEADING, ...egress.map(egressLine), ...publications.map((line) => `  ${publicationLineText(line)}`)];
}

function progressText(attempt: PublishAttemptView): string {
  if (attempt.state !== 'uploading' || attempt.bytesTotal === 0) return '';
  return ` (${formatBytes(attempt.bytesSent)} de ${formatBytes(attempt.bytesTotal)})`;
}

/** One attempt: id, platform, state and its reason text; never a title, caption, tag or URL. */
export function attemptLine(attempt: PublishAttemptView): string {
  const head = `  ${attempt.attemptId} ${platformName(attempt)}: ${PUBLISH_STATE_LABELS[attempt.state]} desde ${formatInstant(attempt.since)}${progressText(attempt)}`;
  if (attempt.reasonId === null) return head;
  return `${head}. ${PUBLISH_FAILURE_TEXTS[attempt.reasonId]} ${NO_RESEND_TEXT}`;
}

/** The newest attempts of the run (at most 10, newest first, as the core view holds them). */
export function attemptLines(attempts: readonly PublishAttemptView[]): string[] {
  if (attempts.length === 0) return [];
  return ['Envios pedidos pelo estúdio:', ...attempts.map(attemptLine)];
}
