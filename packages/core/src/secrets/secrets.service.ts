import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENVIRONMENT_SECRETS, wrapSecretValue, type EnvironmentSecrets } from './environment-secrets';
import { KeychainReader } from './keychain';
import { type RedactableValue, type RevealedRedactableValue, type Secret, type SecretSource } from './secret';
import { SECRET_ENVIRONMENT_VARIABLES, type SecretName } from './secret-names';
import { MalformedSecretError } from './secrets.errors';

/** Never carries a value outside the `Secret` wrapper. */
export type SecretLookup =
  | { status: 'present'; source: SecretSource; secret: Secret }
  | { status: 'missing'; secretName: SecretName; environmentVariable: string };

/** Read-only view the redactor uses: every key value and revealed token currently held by this process. */
export interface LoadedSecretsSource {
  loadedSecrets(): readonly RedactableValue[];
}

/**
 * Revealed platform tokens kept for the redactor. A token in use is registered again before every
 * platform call, so dropping the oldest past this bound only forgets tokens no longer in use.
 */
export const MAX_REVEALED_VALUES = 256;

/**
 * Resolves provider keys: environment first, then the macOS Keychain (D3, ADR 0002). A found
 * key stays in memory inside a `Secret`; nothing here writes it to a file, row, log, event or
 * error. Logs name the secret and its source only. It also holds the platform tokens revealed
 * in this process (SPEC 0007 section 5.2), so the redactor covers them as it covers the keys.
 */
@Injectable()
export class SecretsService implements LoadedSecretsSource {
  private readonly logger = new Logger(SecretsService.name);
  private readonly resolved = new Map<SecretName, Secret>();
  private readonly revealed: RevealedRedactableValue[] = [];

  constructor(
    @Inject(ENVIRONMENT_SECRETS) environment: EnvironmentSecrets,
    private readonly keychain: KeychainReader,
  ) {
    for (const [name, secret] of environment) this.resolved.set(name, secret);
  }

  async resolve(name: SecretName): Promise<SecretLookup> {
    const known = this.resolved.get(name);
    if (known !== undefined) return { status: 'present', source: known.source, secret: known };

    const lookup = await this.keychain.read(name);
    if (lookup.status === 'not-found') {
      this.logger.log({ event: 'secrets.missing', secretName: name });
      return { status: 'missing', secretName: name, environmentVariable: SECRET_ENVIRONMENT_VARIABLES[name] };
    }
    const secret = wrapSecretValue(name, 'keychain', lookup.value);
    if (secret === null) throw new MalformedSecretError(name, 'keychain');
    this.resolved.set(name, secret);
    this.logger.log({ event: 'secrets.loaded', secretName: name, source: 'keychain' });
    return { status: 'present', source: 'keychain', secret };
  }

  /** Registers a revealed platform token with the redactor before it is used; one copy per value. */
  registerRevealedValue(value: RevealedRedactableValue): void {
    // A value seen again moves to the newest place, so a token still in use is never the one dropped.
    const index = this.revealed.findIndex((known) => value.hasSameValue(known));
    if (index !== -1) this.revealed.splice(index, 1);
    this.revealed.push(value);
    if (this.revealed.length > MAX_REVEALED_VALUES) this.revealed.shift();
  }

  loadedSecrets(): readonly RedactableValue[] {
    return [...this.resolved.values(), ...this.revealed];
  }
}
