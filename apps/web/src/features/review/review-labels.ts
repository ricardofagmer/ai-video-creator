import { type QaResult } from '@studio/ui';
import { type CheckId, type CheckResult, type CostSession, type ReviewSubject } from '@studio/shared/run-format';

/** pt-BR names of the C3 check ids (PRD 7.3) shown in "Checagens de qualidade". */
export const checkLabels: Readonly<Record<CheckId, string>> = {
  'output-schema': 'Formato das saídas',
  'refs-resolve': 'Referências resolvidas',
  'claims-evidence': 'Afirmações com evidência',
  container: 'Contêiner',
  codec: 'Codec de vídeo',
  resolution: 'Resolução',
  fps: 'Quadros por segundo',
  duration: 'Duração',
  loudness: 'Loudness integrado',
  'true-peak': 'Pico real',
  'audio-present': 'Áudio presente',
  'black-frames': 'Quadros pretos',
  'caption-timing': 'Sincronia das legendas',
  'reviewer-score': 'Nota do revisor',
  'outputs-present': 'Saídas presentes',
};

export const reviewSubjectLabels: Readonly<Record<ReviewSubject, string>> = {
  script: 'roteiro',
  scenes: 'cenas',
  render: 'vídeo renderizado',
};

/** `skipped` is not a pass: it shows as a warning so the owner sees it was not checked. */
export const checkOutcomeResults: Readonly<Record<CheckResult['outcome'], QaResult>> = {
  passed: 'pass',
  skipped: 'warning',
  failed: 'fail',
  error: 'fail',
};

const ttsProviderLabels: Readonly<Record<Extract<CostSession, { kind: 'tts' }>['provider'], string>> = {
  elevenlabs: 'Voz · ElevenLabs',
  'local-voice': 'Voz · local',
};

/** "Agente ou ferramenta" column of "Custo por sessão" (design/telas/09). */
export function costSessionActor(session: CostSession): string {
  if (session.kind === 'model') return `${session.role} · ${session.modelId}`;
  if (session.kind === 'tts') return ttsProviderLabels[session.provider];
  return 'Renderização';
}

const integerFormatter = new Intl.NumberFormat('pt-BR');
const decimalFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatInteger(value: number): string {
  return integerFormatter.format(value);
}

export function formatDecimal(value: number): string {
  return decimalFormatter.format(value);
}
