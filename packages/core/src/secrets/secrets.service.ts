import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENVIRONMENT_SECRETS, wrapSecretValue, type EnvironmentSecrets } from './environment-secrets';
import { KeychainReader } from './keychain';
import { type Secret, type SecretSource } from './secret';
import { SECRET_ENVIRONMENT_VARIABLES, type SecretName } from './secret-names';
import { MalformedSecretError } from './secrets.errors';

/** Never carries a value outside the `Secret` wrapper. */
export type SecretLookup =
  | { status: 'present'; source: SecretSource; secret: Secret }
  | { status: 'missing'; secretName: SecretName; environmentVariable: string };

/** Read-only view the redactor uses: every key value currently held by this process. */
export interface LoadedSecretsSource {
  loadedSecrets(): readonly Secret[];
}

/**
 * Resolves provider keys: environment first, then the macOS Keychain (D3, ADR 0002). A found
 * key stays in memory inside a `Secret`; nothing here writes it to a file, row, log, event or
 * error. Logs name the secret and its source only.
 */
@Injectable()
export class SecretsService implements LoadedSecretsSource {
  private readonly logger = new Logger(SecretsService.name);
  private readonly resolved = new Map<SecretName, Secret>();

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

  loadedSecrets(): readonly Secret[] {
    return [...this.resolved.values()];
  }
}
