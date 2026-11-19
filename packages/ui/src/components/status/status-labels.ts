import type { BadgeTone } from '../badge/Badge';
import type { AssetSensitivity, AssetStatus, RunStatus, StepStatus } from './status-types';

export interface StatusAppearance {
  label: string;
  tone: BadgeTone;
  /** The dot pulses while the state is live. */
  live?: boolean;
}

// pt-BR texts and tones from design/componentes-estudio.md, section 1.
export const assetStatusAppearance: Readonly<Record<AssetStatus, StatusAppearance>> = {
  draft: { label: 'Rascunho', tone: 'neutral' },
  active: { label: 'Ativo', tone: 'success' },
  deprecated: { label: 'Descontinuado', tone: 'neutral' },
};

export const sensitivityAppearance: Readonly<Record<AssetSensitivity, StatusAppearance>> = {
  normal: { label: 'Normal', tone: 'neutral' },
  biometric: { label: 'Biométrico', tone: 'warning' },
  'third-party': { label: 'Terceiros', tone: 'info' },
};

export const stepStatusAppearance: Readonly<Record<StepStatus, StatusAppearance>> = {
  pending: { label: 'Pendente', tone: 'neutral' },
  running: { label: 'Em execução', tone: 'active', live: true },
  ok: { label: 'Concluído', tone: 'success' },
  warning: { label: 'Concluído com recuperação', tone: 'warning' },
  failed: { label: 'Falhou', tone: 'danger' },
  skipped: { label: 'Pulado', tone: 'neutral' },
};

export const runStatusAppearance: Readonly<Record<RunStatus, StatusAppearance>> = {
  draft: { label: 'Rascunho', tone: 'neutral' },
  pending: { label: 'Na fila', tone: 'neutral' },
  running: { label: 'Em execução', tone: 'active', live: true },
  waiting: { label: 'Aguardando você', tone: 'warning' },
  paused: { label: 'Pausada', tone: 'neutral' },
  failed: { label: 'Falhou', tone: 'danger' },
  interrupted: { label: 'Interrompida', tone: 'warning' },
  review: { label: 'Em revisão', tone: 'info' },
  approved: { label: 'Aprovada', tone: 'success' },
  rejected: { label: 'Rejeitada', tone: 'danger' },
};
