import { formatBytes, type Locale } from '@studio/ui';
import { type RunPublicationLine } from '@studio/shared/platforms';
import { type EgressEntry } from '@studio/shared/run-format';
import { platformLabels } from '@/features/metrics/metric-labels';
import { type WebMessages } from '@/messages';
import { formatInstant } from './publish-labels';

/** One line of "O que saiu da máquina", in the active language; rendered as a text node. */
export interface LeftTheMachineItem {
  key: string;
  text: string;
  /** A simulated upload: nothing actually left the machine. */
  mock: boolean;
  /** The language of `text` when part of it is recorded engine prose (the egress summary). */
  lang?: string;
}

function egressItem(entry: EgressEntry, index: number, t: WebMessages['publishing'], locale: Locale): LeftTheMachineItem {
  return {
    key: `egress-${index}`,
    text: `${formatInstant(entry.at, locale)} ${t.leftTheMachine.providers[entry.provider]}: ${entry.summary}`,
    mock: false,
    // The summary is written by the engine in pt-BR when the run happens.
    lang: locale === 'pt-BR' ? undefined : 'pt-BR',
  };
}

/**
 * Section 5.4, for example "20/11/2026 10:02 YouTube: vídeo final enviado (84 MB), público; ativos
 * biométricos confirmados: voz-ricardo@3." Sizes, the visibility and refs only: a line carries no
 * title, caption, tag, URL, path or account label.
 */
function publicationItem(line: RunPublicationLine, index: number, t: WebMessages['publishing'], locale: Locale): LeftTheMachineItem {
  const texts = t.leftTheMachine;
  const platform = line.mode === 'mock' ? texts.simulated(platformLabels[line.platform]) : platformLabels[line.platform];
  let sentence = `${texts.events[line.event]} (${formatBytes(line.sizeBytes, locale)}), ${t.visibilityWords[line.visibility]}`;
  if (line.biometricRefs.length > 0) sentence += texts.biometricConfirmed(line.biometricRefs.join(', '));
  const reason = line.reasonId === null ? '' : ` ${t.failures[line.reasonId]}`;
  return {
    key: `publication-${line.attemptId}-${line.event}-${index}`,
    text: `${formatInstant(line.at, locale)} ${platform}: ${sentence}.${reason}`,
    mock: line.mode === 'mock',
  };
}

/**
 * "O que saiu da máquina" (section 5.4, AC 49): `manifest.json.egress` first, then the run's
 * `publications.jsonl` lines, oldest first, as the api returns them.
 */
export function leftTheMachineItems(
  egress: readonly EgressEntry[],
  lines: readonly RunPublicationLine[],
  t: WebMessages['publishing'],
  locale: Locale,
): LeftTheMachineItem[] {
  return [...egress.map((entry, index) => egressItem(entry, index, t, locale)), ...lines.map((line, index) => publicationItem(line, index, t, locale))];
}
