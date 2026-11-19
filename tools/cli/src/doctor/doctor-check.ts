/** `warning` is shown but does not fail `doctor`; `failed` makes it exit 6. */
export type CheckStatus = 'ok' | 'warning' | 'failed';

export interface DoctorCheck {
  /** pt-BR label of what was checked. */
  label: string;
  status: CheckStatus;
  /** pt-BR detail; ids, ports, versions and counts only. */
  detail: string;
}

const statusMarks: Readonly<Record<CheckStatus, string>> = { ok: '[ok]   ', warning: '[aviso]', failed: '[falha]' };

export function checkLine(check: DoctorCheck): string {
  return `${statusMarks[check.status]} ${check.label}: ${check.detail}`;
}

export function hasFailure(checks: readonly DoctorCheck[]): boolean {
  return checks.some((check) => check.status === 'failed');
}
