import { type RedactorService } from '../../redaction';

/** `unknown` is treated exactly like `biometric` by every caller: the guard fails closed. */
export type BiometricPathState = 'clear' | 'biometric' | 'unknown';

/**
 * Whether a file path lies on or below a registered biometric reference path (PRD 12). It reuses
 * the core redactor's compiled biometric pattern rather than a second matcher, so the two can
 * never disagree; a redactor failure (registry unreadable) answers `unknown`.
 */
export async function biometricPathState(redactor: RedactorService, path: string): Promise<BiometricPathState> {
  const result = await redactor.redactText(path);
  if (result.status === 'failed') return 'unknown';
  return result.counts.biometric > 0 ? 'biometric' : 'clear';
}
