import type { ProviderName } from '../run-format/vocabulary';

/**
 * Named fault a mock adapter reproduces (SPEC 0002 A12); inert in live mode. `missing-output`
 * reports success while leaving the declared output absent (criterion 11).
 */
export type MockFaultScenario = 'none' | 'step-failure' | 'authentication-error' | 'missing-output';

export type ProviderModeState = { mode: 'mock'; fault: MockFaultScenario } | { mode: 'live' };

/** Never carries a secret value; `missing` names the variable or Keychain item to set. */
export type CredentialStatus =
  | { status: 'not-required' }
  | { status: 'present'; source: 'environment' | 'keychain' }
  | { status: 'missing'; secretName: string };

/**
 * Mock/live switch per provider (R1-11). Mock is the default; live mode with a missing credential
 * fails at start and never falls back to a literal or to mock (PRD 12).
 */
export interface ProviderModePort {
  modeOf(provider: ProviderName): ProviderModeState;
  credentialStatus(provider: ProviderName): Promise<CredentialStatus>;
}
