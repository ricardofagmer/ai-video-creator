import { formatBytes } from '@studio/ui';
import { type RunPublicationLine } from '@studio/shared/platforms';
import { type EgressEntry, type ProviderName } from '@studio/shared/run-format';
import { platformLabels } from '@/features/metrics/metric-labels';
import { formatInstant, publishFailureTexts, visibilityWords } from './publish-labels';

/** One line of "O que saiu da máquina", already in pt-BR; rendered as a text node. */
export interface LeftTheMachineItem {
  key: string;
  text: string;
  /** A simulated upload: nothing actually left the machine. */
  mock: boolean;
}

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

function egressItem(entry: EgressEntry, index: number): LeftTheMachineItem {
  return {
    key: `egress-${index}`,
    text: `${formatInstant(entry.at)} ${providerLabels[entry.provider]}: ${entry.summary}`,
    mock: false,
  };
}

/**
 * Section 5.4, for example "20/11/2026 10:02 YouTube: vídeo final enviado (84 MB), público; ativos
 * biométricos confirmados: voz-ricardo@3." Sizes, the visibility and refs only: a line carries no
 * title, caption, tag, URL, path or account label.
 */
function publicationItem(line: RunPublicationLine, index: number): LeftTheMachineItem {
  const platform = line.mode === 'mock' ? `${platformLabels[line.platform]} (simulado)` : platformLabels[line.platform];
  let sentence = `${eventPhrases[line.event]} (${formatBytes(line.sizeBytes)}), ${visibilityWords[line.visibility]}`;
  if (line.biometricRefs.length > 0) sentence += `; ativos biométricos confirmados: ${line.biometricRefs.join(', ')}`;
  const reason = line.reasonId === null ? '' : ` ${publishFailureTexts[line.reasonId]}`;
  return {
    key: `publication-${line.attemptId}-${line.event}-${index}`,
    text: `${formatInstant(line.at)} ${platform}: ${sentence}.${reason}`,
    mock: line.mode === 'mock',
  };
}

/**
 * "O que saiu da máquina" (section 5.4, AC 49): `manifest.json.egress` first, then the run's
 * `publications.jsonl` lines, oldest first, as the api returns them.
 */
export function leftTheMachineItems(egress: readonly EgressEntry[], lines: readonly RunPublicationLine[]): LeftTheMachineItem[] {
  return [...egress.map(egressItem), ...lines.map(publicationItem)];
}
