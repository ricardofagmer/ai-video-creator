import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { type CredentialStatus, type ProviderModePort, type ProviderModeState } from '@studio/shared/ports';
import { ProviderNameSchema, type ProviderName } from '@studio/shared/run-format';
import { type Secret } from '../secrets/secret';
import { SECRET_ENVIRONMENT_VARIABLES, type SecretName } from '../secrets/secret-names';
import { SecretsService } from '../secrets/secrets.service';
import { CLAUDE_ENGINE_SETTINGS, DEFAULT_CLAUDE_ENGINE_SETTINGS, type ClaudeEngineSettings } from './claude-engine.config';
import { requiredCredential } from './provider-credentials';
import { PROVIDER_MODE_SETTINGS, type ProviderModeSettings } from './provider-modes.config';
import { ProviderCredentialMissingError, ProviderNotLiveError, ProviderWithoutCredentialError } from './providers.errors';

/**
 * C6 `ProviderModePort` (R1-11). Mock is the default for every provider. At module start every
 * live provider's key is resolved; a missing key throws `ProviderCredentialMissingError`, which
 * stops the composition root from starting: no literal fallback and no silent switch to mock.
 *
 * ADR 0011: with the `claude-code` engine the live `claude` provider signs in through the Claude
 * Code CLI, so the studio neither requires nor reads `anthropic-api-key` for it.
 */
@Injectable()
export class ProviderModeService implements ProviderModePort, OnModuleInit {
  private readonly logger = new Logger(ProviderModeService.name);
  private readonly liveCredentials = new Map<ProviderName, Secret>();

  constructor(
    @Inject(PROVIDER_MODE_SETTINGS) private readonly settings: ProviderModeSettings,
    private readonly secrets: SecretsService,
    @Inject(CLAUDE_ENGINE_SETTINGS) private readonly claudeEngineSettings: ClaudeEngineSettings = DEFAULT_CLAUDE_ENGINE_SETTINGS,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const provider of ProviderNameSchema.options) {
      const state = this.settings[provider];
      const secretName = this.credentialNameOf(provider);
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
        engine: provider === 'claude' && state.mode === 'live' ? this.claudeEngineSettings.engine : null,
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

  /** True when live Claude calls go through the Claude Code CLI on the owner's subscription (ADR 0011). */
  usesClaudeCode(): boolean {
    return this.isLive('claude') && this.claudeEngineSettings.engine === 'claude-code';
  }

  /** The CLI path the owner pinned, or null to resolve `claude` on PATH. */
  claudeCodeBinary(): string | null {
    return this.claudeEngineSettings.binary;
  }

  /** Mock providers need no key, so `preflight` never reaches the Keychain on an offline run. */
  async credentialStatus(provider: ProviderName): Promise<CredentialStatus> {
    const secretName = this.credentialNameOf(provider);
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
    const secretName = this.credentialNameOf(provider);
    if (secretName === null) throw new ProviderWithoutCredentialError(provider);
    throw new ProviderCredentialMissingError(provider, secretName, SECRET_ENVIRONMENT_VARIABLES[secretName]);
  }

  private credentialNameOf(provider: ProviderName): SecretName | null {
    if (provider === 'claude' && this.claudeEngineSettings.engine === 'claude-code') return null;
    return requiredCredential(provider);
  }
}
