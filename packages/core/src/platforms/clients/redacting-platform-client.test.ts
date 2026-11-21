import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RedactorService } from '../../redaction/redactor.service';
import { readEnvironmentSecrets } from '../../secrets/environment-secrets';
import { KeychainReader, type KeychainLookup } from '../../secrets/keychain';
import { SecretsService } from '../../secrets/secrets.service';
import { RecordingClient } from '../recording-client.harness.test';
import { SecretToken, type TokenBundle } from '../token-bundle';
import {
  FIXTURE_CONNECTION_ID,
  SENTINEL_ACCESS_TOKEN,
  SENTINEL_AUTHORIZATION_CODE,
  SENTINEL_REFRESH_TOKEN,
  sentinelTokenBundle,
  sentinelsIn,
} from '../token-fixtures.harness.test';
import { MockPlatformClient } from './mock/mock-platform-client';
import { mockPlatformProfiles } from './mock/mock-profiles';
import { type MetricResult, type MetricsRequest, type PlatformClient } from './platform-client.port';
import { RedactingPlatformClients } from './redacting-platform-client';

/*
 * Finding S4 (SPEC 0007 section 5.2: tokens are covered by the redactor). Every token a platform
 * call receives or returns is registered with the value redactor before it is used, so text that
 * quotes it (a log line, an error, a run file) is written with `<redacted>` in its place. The
 * redactor is the real `RedactorService` over a real `SecretsService`; the Keychain reader never
 * runs a tool and the clients make no request.
 */

const NOW = new Date('2026-11-20T10:00:00.000Z');
const ATTEMPT_ID = '01JD2Q7F3M8V5K9X4T6R2N0B1C';
const SENTINEL_VERIFIER = 'SENTINEL-PKCE-VERIFIER-a41c0de7';

/** Never runs `/usr/bin/security`: every provider key reads as absent. */
class AbsentKeychain extends KeychainReader {
  override read(): Promise<KeychainLookup> {
    return Promise.resolve({ status: 'not-found' });
  }
}

interface RedactionFixture {
  secrets: SecretsService;
  redactor: RedactorService;
}

function redactionFixture(): RedactionFixture {
  const secrets = new SecretsService(readEnvironmentSecrets({}), new AbsentKeychain());
  const redactor = new RedactorService(secrets, { listBiometricReferencePaths: async () => [] });
  return { secrets, redactor };
}

function wrap(fixture: RedactionFixture, inner: PlatformClient): PlatformClient {
  return new RedactingPlatformClients({ clientFor: () => inner }, fixture.secrets).clientFor(inner.platform);
}

/** What a log writer would write for `text`. */
async function logged(fixture: RedactionFixture, text: string): Promise<string> {
  const result = await fixture.redactor.redactText(text);
  assert.equal(result.status, 'redacted');
  return result.status === 'redacted' ? result.value : '';
}

function metricsRequest(tokens: TokenBundle): MetricsRequest {
  return { targets: [], tokens, now: NOW, signal: new AbortController().signal };
}

const LEAKY_LINE = `platform call failed: access ${SENTINEL_ACCESS_TOKEN} refresh ${SENTINEL_REFRESH_TOKEN}`;

/** Checks, from inside the platform call, whether the redactor already covers the tokens it received. */
class RedactionCheckingClient extends RecordingClient {
  readonly linesSeenDuringCall: string[] = [];

  constructor(private readonly fixture: RedactionFixture) {
    super('youtube');
  }

  override async fetchMetrics(request: MetricsRequest): Promise<MetricResult[]> {
    this.linesSeenDuringCall.push(await logged(this.fixture, LEAKY_LINE));
    return super.fetchMetrics(request);
  }
}

describe('RedactingPlatformClients (S4)', () => {
  it('redacts the tokens of a bundle from every log line written after a platform call', async () => {
    const fixture = redactionFixture();
    const client = wrap(fixture, new RecordingClient('youtube'));
    assert.deepEqual(sentinelsIn(await logged(fixture, LEAKY_LINE)), [SENTINEL_ACCESS_TOKEN, SENTINEL_REFRESH_TOKEN], 'not known before');

    await client.fetchMetrics(metricsRequest(sentinelTokenBundle('youtube')));

    const line = await logged(fixture, LEAKY_LINE);
    assert.deepEqual(sentinelsIn(line), []);
    assert.match(line, /<redacted>/);
  });

  it('registers the tokens before the inner client runs, not after it returns', async () => {
    const fixture = redactionFixture();
    const inner = new RedactionCheckingClient(fixture);

    await wrap(fixture, inner).fetchMetrics(metricsRequest(sentinelTokenBundle('youtube')));

    assert.equal(inner.linesSeenDuringCall.length, 1);
    assert.deepEqual(sentinelsIn(inner.linesSeenDuringCall[0] ?? ''), []);
  });

  it('registers the code, the verifier and the bundle an exchange returns', async () => {
    const fixture = redactionFixture();
    const client = wrap(fixture, new RecordingClient('youtube'));

    await client.exchangeCode({
      code: new SecretToken(SENTINEL_AUTHORIZATION_CODE),
      verifier: new SecretToken(SENTINEL_VERIFIER),
      redirectUri: 'http://127.0.0.1:4000/platforms/youtube/callback',
      credentials: null,
      connectionId: FIXTURE_CONNECTION_ID,
      now: NOW,
    });

    const line = await logged(fixture, `${LEAKY_LINE} code ${SENTINEL_AUTHORIZATION_CODE} verifier ${SENTINEL_VERIFIER}`);
    assert.deepEqual(sentinelsIn(line), []);
    assert.equal(line.includes(SENTINEL_VERIFIER), false);
  });

  it('registers the new tokens a refresh returns', async () => {
    const fixture = redactionFixture();
    const client = wrap(fixture, new MockPlatformClient(mockPlatformProfiles.youtube, 'none'));

    const refreshed = await client.refresh(sentinelTokenBundle('youtube'), null, NOW);

    const newAccess = refreshed.accessToken.revealForPlatformCall();
    assert.notEqual(newAccess, SENTINEL_ACCESS_TOKEN);
    const line = await logged(fixture, `refreshed to ${newAccess}`);
    assert.equal(line.includes(newAccess), false);
  });

  it('registers the tokens passed to identity, revoke and upload status calls', async () => {
    const calls: { name: string; run: (client: PlatformClient, tokens: TokenBundle) => Promise<unknown> }[] = [
      { name: 'fetchIdentity', run: (client, tokens) => client.fetchIdentity(tokens) },
      { name: 'revoke', run: (client, tokens) => client.revoke(tokens, null) },
      { name: 'uploadStatus', run: (client, tokens) => client.uploadStatus({ attemptId: ATTEMPT_ID, uploadRef: 'mock-ref', tokens, now: NOW }) },
    ];
    for (const call of calls) {
      const fixture = redactionFixture();

      await call.run(wrap(fixture, new RecordingClient('youtube')), sentinelTokenBundle('youtube'));

      assert.deepEqual(sentinelsIn(await logged(fixture, LEAKY_LINE)), [], call.name);
    }
  });

  it('keeps one copy per token value when the same bundle is used on every call', async () => {
    const fixture = redactionFixture();
    const client = wrap(fixture, new RecordingClient('youtube'));

    await client.fetchMetrics(metricsRequest(sentinelTokenBundle('youtube')));
    await client.fetchMetrics(metricsRequest(sentinelTokenBundle('youtube')));

    assert.equal(fixture.secrets.loadedSecrets().length, 2, 'the access and the refresh token, once each');
  });
});
