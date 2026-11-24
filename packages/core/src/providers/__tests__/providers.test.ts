import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { ProviderNameSchema } from '@studio/shared/run-format';
import { type EnvironmentSecrets } from '../../secrets/environment-secrets';
import { KeychainReader, type KeychainLookup } from '../../secrets/keychain';
import { SecretsService } from '../../secrets/secrets.service';
import { createCoverageHome, type CoverageHome } from '../../test-support';
import {
  InvalidProviderModeConfigError,
  ProviderCredentialMissingError,
  ProviderModeService,
  ProviderNotLiveError,
  ProviderWithoutCredentialError,
  mockFaultVariable,
  modeVariable,
  type ProviderModeSettings,
} from '..';
import { readProviderModeSettings } from '../provider-modes.config';

/*
 * Ticket 07 (providers): the real mode parser and ProviderModeService. Settings are parsed from a
 * literal map handed to the parser (the providers module factory passes the real environment);
 * the Keychain boundary is a fake that counts reads and never starts the system tool.
 */

/** Answers every Keychain read with `answer` and counts the reads. */
class CountingKeychain extends KeychainReader {
  reads = 0;

  constructor(private readonly answer: KeychainLookup) {
    super();
  }

  override read(): Promise<KeychainLookup> {
    this.reads += 1;
    return Promise.resolve(this.answer);
  }
}

const NO_ENVIRONMENT_SECRETS: EnvironmentSecrets = new Map();

function serviceWith(settings: ProviderModeSettings, keychain: KeychainReader): ProviderModeService {
  return new ProviderModeService(settings, new SecretsService(NO_ENVIRONMENT_SECRETS, keychain));
}

describe('providers (ticket 07)', () => {
  let home: CoverageHome;

  beforeEach(async () => {
    home = await createCoverageHome({ prefix: 'core-providers', start: new Date('2026-11-21T10:00:00.000Z') });
  });

  afterEach(async () => {
    await home.close();
  });

  describe('mock by default', () => {
    it('parses every provider as mock without a fault when no variable is set', () => {
      const settings = readProviderModeSettings({});

      assert.deepEqual(settings, {
        claude: { mode: 'mock', fault: 'none' },
        elevenlabs: { mode: 'mock', fault: 'none' },
        'local-voice': { mode: 'mock', fault: 'none' },
        capture: { mode: 'mock', fault: 'none' },
        render: { mode: 'mock', fault: 'none' },
      });
    });

    it('resolves each provider to its mock and never reads the Keychain', async () => {
      const keychain = new CountingKeychain({ status: 'found', value: home.sentinelKey });
      const modes = serviceWith(readProviderModeSettings({}), keychain);

      await modes.onModuleInit();

      for (const provider of ProviderNameSchema.options) {
        assert.equal(modes.isLive(provider), false, provider);
        assert.equal(modes.modeOf(provider).mode, 'mock', provider);
        assert.deepEqual(await modes.credentialStatus(provider), { status: 'not-required' }, provider);
        assert.throws(() => modes.credentialFor(provider), ProviderNotLiveError, provider);
      }
      assert.equal(keychain.reads, 0);
    });

    it('keeps a mock fault scenario named by its variable', () => {
      const settings = readProviderModeSettings({ [mockFaultVariable('render')]: 'step-failure' });

      assert.deepEqual(settings.render, { mode: 'mock', fault: 'step-failure' });
      assert.deepEqual(settings.claude, { mode: 'mock', fault: 'none' });
    });
  });

  describe('live mode', () => {
    it('loads a live provider key once at start and never logs it', async () => {
      const keychain = new CountingKeychain({ status: 'found', value: home.sentinelKey });
      const modes = serviceWith(readProviderModeSettings({ [modeVariable('claude')]: 'live' }), keychain);

      await modes.onModuleInit();
      const credential = modes.credentialFor('claude');

      assert.equal(keychain.reads, 1);
      assert.equal(credential.revealForProviderCall(), home.sentinelKey);
      assert.equal(String(credential).includes(home.sentinelKey), false);
      assert.ok(home.logs.text().includes('providers.mode'));
      assert.equal(home.logs.text().includes(home.sentinelKey), false);
    });

    it('reports a live provider without a key as missing', async () => {
      const modes = serviceWith(readProviderModeSettings({ [modeVariable('claude')]: 'live' }), new CountingKeychain({ status: 'not-found' }));

      assert.deepEqual(await modes.credentialStatus('claude'), { status: 'missing', secretName: 'anthropic-api-key' });
    });
  });

  describe('typed errors', () => {
    it('refuses an unknown mode value and names the variable, not the value', () => {
      const variable = modeVariable('claude');

      assert.throws(
        () => readProviderModeSettings({ [variable]: 'coverage-not-a-mode' }),
        (error: unknown) => {
          assert.ok(error instanceof InvalidProviderModeConfigError);
          assert.equal(error.variable, variable);
          assert.equal(error.message.includes('coverage-not-a-mode'), false);
          return true;
        },
      );
    });

    it('stops the start when a live provider has no key, with no fallback to mock', async () => {
      const modes = serviceWith(readProviderModeSettings({ [modeVariable('claude')]: 'live' }), new CountingKeychain({ status: 'not-found' }));

      await assert.rejects(modes.onModuleInit(), (error: unknown) => {
        assert.ok(error instanceof ProviderCredentialMissingError);
        assert.equal(error.provider, 'claude');
        assert.equal(error.secretName, 'anthropic-api-key');
        return true;
      });
      assert.equal(modes.isLive('claude'), true);
    });

    it('refuses a credential for a live provider that needs none', async () => {
      const keychain = new CountingKeychain({ status: 'not-found' });
      const modes = serviceWith(readProviderModeSettings({ [modeVariable('render')]: 'live' }), keychain);

      await modes.onModuleInit();

      assert.throws(() => modes.credentialFor('render'), ProviderWithoutCredentialError);
      assert.equal(keychain.reads, 0);
    });
  });
});
