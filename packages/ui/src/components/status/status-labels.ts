import type { BadgeTone } from '../badge/Badge';
import type { AssetSensitivity, AssetStatus, RunStatus, StepStatus } from './status-types';

export interface StatusAppearance {
  tone: BadgeTone;
  /** The dot pulses while the state is live. */
  live?: boolean;
}

// Tones from design/componentes-estudio.md, section 1. The texts live in the catalogue
// (`UiMessages.status`), so a status without a text in any language fails the build.
export const assetStatusAppearance: Readonly<Record<AssetStatus, StatusAppearance>> = {
  draft: { tone: 'neutral' },
  active: { tone: 'success' },
  deprecated: { tone: 'neutral' },
};

export const sensitivityAppearance: Readonly<Record<AssetSensitivity, StatusAppearance>> = {
  normal: { tone: 'neutral' },
  biometric: { tone: 'warning' },
  'third-party': { tone: 'info' },
};

export const stepStatusAppearance: Readonly<Record<StepStatus, StatusAppearance>> = {
  pending: { tone: 'neutral' },
  running: { tone: 'active', live: true },
  ok: { tone: 'success' },
  warning: { tone: 'warning' },
  failed: { tone: 'danger' },
  skipped: { tone: 'neutral' },
};

export const runStatusAppearance: Readonly<Record<RunStatus, StatusAppearance>> = {
  draft: { tone: 'neutral' },
  pending: { tone: 'neutral' },
  running: { tone: 'active', live: true },
  waiting: { tone: 'warning' },
  paused: { tone: 'neutral' },
  failed: { tone: 'danger' },
  interrupted: { tone: 'warning' },
  review: { tone: 'info' },
  approved: { tone: 'success' },
  rejected: { tone: 'danger' },
};
