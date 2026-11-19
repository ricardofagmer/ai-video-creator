import { type RunStatus, type StageId, type StepName, type StepStatus } from '@studio/shared/run-format';

/** pt-BR labels of PRD 7.2 run statuses, as the web shows them (D16). */
export const RUN_STATUS_LABELS: Readonly<Record<RunStatus, string>> = {
  draft: 'rascunho',
  pending: 'na fila',
  running: 'executando',
  waiting: 'aguardando você',
  paused: 'pausada',
  failed: 'falhou',
  interrupted: 'interrompida',
  review: 'em revisão',
  approved: 'aprovada',
  rejected: 'rejeitada',
};

export const STEP_LABELS: Readonly<Record<StepName, string>> = {
  brief: 'brief',
  preflight: 'pré-checagem',
  snapshot: 'snapshot',
  execute: 'execução',
  verify: 'verificação',
  archive: 'arquivo',
  record: 'registro',
};

export const STEP_STATUS_LABELS: Readonly<Record<StepStatus, string>> = {
  pending: 'pendente',
  running: 'em andamento',
  ok: 'ok',
  warning: 'ok com aviso',
  failed: 'falhou',
  skipped: 'pulada',
};

export const STAGE_LABELS: Readonly<Record<StageId, string>> = {
  plan: 'plano',
  research: 'pesquisa',
  verify: 'verificação',
  script: 'roteiro',
  capture: 'captura',
  scenes: 'cenas',
  narration: 'narração',
  composition: 'composição',
  captions: 'legendas',
  fades: 'fades',
  music: 'música',
  qa: 'QA',
  'agent-review': 'revisão do agente',
  package: 'pacote',
};

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${BYTE_UNITS[unit] ?? 'B'}`;
}

export function formatUsd(amount: number): string {
  return `US$ ${amount.toFixed(2)}`;
}

export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes === 0 ? `${seconds}s` : `${minutes}min ${String(seconds).padStart(2, '0')}s`;
}

/** Cuts to `width` characters so table columns stay aligned; never wraps. */
export function fitText(text: string, width: number): string {
  if (text.length <= width) return text.padEnd(width);
  return `${text.slice(0, Math.max(0, width - 1))}…`;
}
