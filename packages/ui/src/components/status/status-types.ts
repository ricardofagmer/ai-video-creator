// Presentational mirrors of the C1/C3 enums (PRD 5.2 and 7.2). The web passes the
// contract values in; TypeScript flags drift if a contract enum gains a member.
export type AssetStatus = 'draft' | 'active' | 'deprecated';

export type AssetSensitivity = 'normal' | 'biometric' | 'third-party';

export type StepStatus = 'pending' | 'running' | 'ok' | 'warning' | 'failed' | 'skipped';

export type RunStatus =
  | 'draft'
  | 'pending'
  | 'running'
  | 'waiting'
  | 'paused'
  | 'failed'
  | 'interrupted'
  | 'review'
  | 'approved'
  | 'rejected';

export type WatcherState = 'running' | 'stopped' | 'unknown';
