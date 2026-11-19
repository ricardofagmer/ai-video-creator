import { type ProviderName } from '@studio/shared/run-format';
import { type SecretName } from '../secrets/secret-names';

/** Error taxonomy category (rules/observability.md). */
export type ProvidersErrorCategory = 'validation' | 'auth' | 'internal';

/** Messages name providers, variables and secret names only; never a value. */
export abstract class ProvidersError extends Error {
  abstract readonly category: ProvidersErrorCategory;
}

/** A mode variable holds something other than `mock` / `live` or a known fault scenario. */
export class InvalidProviderModeConfigError extends ProvidersError {
  override readonly category = 'validation';

  constructor(readonly variable: string) {
    super(`Invalid provider mode setting in ${variable}`);
    this.name = 'InvalidProviderModeConfigError';
  }
}

/**
 * PRD 12 / ADR 0002: live mode with no key fails at start. There is no fallback to a literal and
 * none to mock; the owner sets the variable or runs `studio secrets set <secretName>`.
 */
export class ProviderCredentialMissingError extends ProvidersError {
  override readonly category = 'auth';

  constructor(
    readonly provider: ProviderName,
    readonly secretName: SecretName,
    readonly environmentVariable: string,
  ) {
    super(
      `Provider ${provider} is in live mode but ${secretName} is missing; set ${environmentVariable} or run "studio secrets set ${secretName}"`,
    );
    this.name = 'ProviderCredentialMissingError';
  }
}

/** A live adapter asked for a key while its provider is in mock mode: a wiring defect. */
export class ProviderNotLiveError extends ProvidersError {
  override readonly category = 'internal';

  constructor(readonly provider: ProviderName) {
    super(`Provider ${provider} is not in live mode; no credential is handed out`);
    this.name = 'ProviderNotLiveError';
  }
}

/** A local provider (local voice, render, capture) has no studio key to hand out: a wiring defect. */
export class ProviderWithoutCredentialError extends ProvidersError {
  override readonly category = 'internal';

  constructor(readonly provider: ProviderName) {
    super(`Provider ${provider} uses no studio credential`);
    this.name = 'ProviderWithoutCredentialError';
  }
}
