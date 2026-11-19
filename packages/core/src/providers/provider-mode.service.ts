import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { type CredentialStatus, type ProviderModePort, type ProviderModeState } from '@studio/shared/ports';
import { ProviderNameSchema, type ProviderName } from '@studio/shared/run-format';
import { type Secret } from '../secrets/secret';
import { SECRET_ENVIRONMENT_VARIABLES } from '../secrets/secret-names';
import { SecretsService } from '../secrets/secrets.service';
import { requiredCredential } from './provider-credentials';
import { PROVIDER_MODE_SETTINGS, type ProviderModeSettings } from './provider-modes.config';
import { ProviderCredentialMissingError, ProviderNotLiveError, ProviderWithoutCredentialError } from './providers.errors';

/**
 * C6 `ProviderModePort` (R1-11). Mock is the default for every provider. At module start every
 * live provider's key is resolved; a missing key throws `ProviderCredentialMissingError`, which
 * stops the composition root from starting: no literal fallback and no silent switch to mock.
 */
@Injectable()
export class ProviderModeService implements ProviderModePort, OnModuleInit {
  private readonly logger = new Logger(ProviderModeService.name);
  private readonly liveCredentials = new Map<ProviderName, Secret>();

  constructor(
    @Inject(PROVIDER_MODE_SETTINGS) private readonly settings: ProviderModeSettings,
    private readonly secrets: SecretsService,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const provider of ProviderNameSchema.options) {
      const state = this.settings[provider];
      const secretName = requiredCredential(provider);
      if (state.mode === 'live' && secretName !== null) {
        const lookup = await this.secrets.resolve(secretName);
        if (lookup.status === 'missing') {
          throw new ProviderCredentialMissingError(provider, secretName, lookup.environmentVariable);
        }
        this.liveCredentials.set(provider, lookup.secret);
      }
      this.logger.log({
        event: 'providers.mode',
        provider,
        mode: state.mode,
        fault: state.mode === 'mock' ? state.fault : null,
        credentialSource: this.liveCredentials.get(provider)?.source ?? null,
      });
    }
  }

  modeOf(provider: ProviderName): ProviderModeState {
    return this.settings[provider];
  }

  isLive(provider: ProviderName): boolean {
    return this.settings[provider].mode === 'live';
  }

  /** Mock providers need no key, so `preflight` never reaches the Keychain on an offline run. */
  async credentialStatus(provider: ProviderName): Promise<CredentialStatus> {
    const secretName = requiredCredential(provider);
    if (secretName === null || !this.isLive(provider)) return { status: 'not-required' };
    const lookup = await this.secrets.resolve(secretName);
    // The Keychain item name is what `studio secrets set <name>` takes.
    if (lookup.status === 'missing') return { status: 'missing', secretName: lookup.secretName };
    return { status: 'present', source: lookup.source };
  }

  /** For live adapters only (R1-12, R1-14); the `Secret` prints `<redacted>` everywhere. */
  credentialFor(provider: ProviderName): Secret {
    if (!this.isLive(provider)) throw new ProviderNotLiveError(provider);
    const secret = this.liveCredentials.get(provider);
    if (secret !== undefined) return secret;
    const secretName = requiredCredential(provider);
    if (secretName === null) throw new ProviderWithoutCredentialError(provider);
    throw new ProviderCredentialMissingError(provider, secretName, SECRET_ENVIRONMENT_VARIABLES[secretName]);
  }
}
