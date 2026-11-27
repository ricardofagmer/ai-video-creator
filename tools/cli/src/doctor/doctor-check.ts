import { cliText } from '../i18n/messages.js';

/** `warning` is shown but does not fail `doctor`; `failed` makes it exit 6. */
export type CheckStatus = 'ok' | 'warning' | 'failed';

export interface DoctorCheck {
  /** Label of what was checked, in the active language. */
  label: string;
  status: CheckStatus;
  /** Detail in the active language; ids, ports, versions and counts only. */
  detail: string;
}

export function checkLine(check: DoctorCheck): string {
  return `${cliText().doctor.marks[check.status]} ${check.label}: ${check.detail}`;
}

export function hasFailure(checks: readonly DoctorCheck[]): boolean {
  return checks.some((check) => check.status === 'failed');
}
