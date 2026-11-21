import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { describe, it } from 'node:test';
import { TokenVaultUnavailableError } from '../platforms.errors';
import {
  MAX_ENCODED_TOKEN_BUNDLE_BYTES,
  MAX_TOKEN_TEXT_CHARS,
  SecretToken,
  TokenBundleInvalidError,
  accessTokenNeedsRefresh,
  decodeTokenBundle,
  encodeTokenBundle,
} from '../token-bundle';
import { SENTINEL_ACCESS_TOKEN, SENTINEL_REFRESH_TOKEN, sentinelTokenBundle, sentinelsIn } from '../token-fixtures.harness.test';
import { InMemoryPlatformTokenVault } from './in-memory-token-vault';

/*
 * The token bundle and the fake vault (SPEC 0007 sections 4.3, 5.2 and 12; K3, K7, AC 41, AC 60):
 * a token prints `<redacted>` everywhere, a token text is at most 1,024 characters and the encoded
 * bundle at most 3,600 bytes (finding S5), and the fake vault applies the same encoding the Keychain
 * item holds.
 */

describe('SecretToken redaction', () => {
  it('prints <redacted> through String, template, JSON, inspect and error messages', () => {
    const token = new SecretToken(SENTINEL_ACCESS_TOKEN);
    const printed = [
      String(token),
      `${token}`,
      JSON.stringify({ token }),
      inspect({ token }),
      new Error(`failed with ${token}`).message,
    ].join('\n');
    assert.deepEqual(sentinelsIn(printed), []);
    assert.equal(token.revealForPlatformCall(), SENTINEL_ACCESS_TOKEN);
    assert.equal(token.length, SENTINEL_ACCESS_TOKEN.length);
  });

  it('keeps a whole bundle redacted when it is inspected or serialised', () => {
    const bundle = sentinelTokenBundle('youtube');
    assert.deepEqual(sentinelsIn(`${JSON.stringify(bundle)}\n${inspect(bundle, { depth: 5 })}`), []);
  });
});

describe('token bundle encoding', () => {
  it('round-trips a bundle through the Keychain password form', () => {
    const decoded = decodeTokenBundle(encodeTokenBundle(sentinelTokenBundle('tiktok')));
    assert.equal(decoded.platform, 'tiktok');
    assert.equal(decoded.accessToken.revealForPlatformCall(), SENTINEL_ACCESS_TOKEN);
    assert.equal(decoded.refreshToken?.revealForPlatformCall(), SENTINEL_REFRESH_TOKEN);
  });

  it('encodes two 1,024-character tokens within the 3,600-byte Keychain bound (S5)', () => {
    const bundle = sentinelTokenBundle('youtube', {
      accessToken: new SecretToken('x'.repeat(MAX_TOKEN_TEXT_CHARS)),
      refreshToken: new SecretToken('y'.repeat(MAX_TOKEN_TEXT_CHARS)),
    });
    const encoded = encodeTokenBundle(bundle);
    assert.ok(encoded.length <= MAX_ENCODED_TOKEN_BUNDLE_BYTES);
    assert.equal(decodeTokenBundle(encoded).accessToken.revealForPlatformCall(), 'x'.repeat(MAX_TOKEN_TEXT_CHARS));
  });

  it('refuses a bundle whose encoded form exceeds 3,600 bytes as too-large (S5)', () => {
    const bundle = sentinelTokenBundle('youtube', {
      accessToken: new SecretToken('x'.repeat(MAX_TOKEN_TEXT_CHARS)),
      refreshToken: new SecretToken('y'.repeat(MAX_TOKEN_TEXT_CHARS)),
      scopes: Array.from({ length: 12 }, () => 's'.repeat(120)),
    });
    assert.throws(
      () => encodeTokenBundle(bundle),
      (error: unknown) => error instanceof TokenBundleInvalidError && error.problem === 'too-large' && !error.message.includes('xxxx'),
    );
  });

  it('decodes nothing longer than the 3,600-byte bound', () => {
    const oversized = new SecretToken('A'.repeat(MAX_ENCODED_TOKEN_BUNDLE_BYTES + 1));
    assert.throws(
      () => decodeTokenBundle(oversized),
      (error: unknown) => error instanceof TokenBundleInvalidError && error.problem === 'corrupt',
    );
  });

  it('refuses a token over 1,024 characters or with a space as invalid fields, without quoting it', () => {
    for (const value of ['x'.repeat(MAX_TOKEN_TEXT_CHARS + 1), `has space ${SENTINEL_ACCESS_TOKEN}`]) {
      const bundle = sentinelTokenBundle('youtube', { accessToken: new SecretToken(value) });
      assert.throws(
        () => encodeTokenBundle(bundle),
        (error: unknown) =>
          error instanceof TokenBundleInvalidError &&
          error.problem === 'invalid-fields' &&
          !error.message.includes('xxxx') &&
          sentinelsIn(error.message).length === 0,
      );
    }
  });

  it('decodes anything outside the schema as corrupt and never quotes it', () => {
    const notJson = new SecretToken(Buffer.from(`{${SENTINEL_ACCESS_TOKEN}`, 'utf8').toString('base64url'));
    const storedWithExtraField = {
      format: 1,
      platform: 'youtube',
      connectionId: '01JD2Q7F3M8V5K9X4T6R2N0C0N',
      accessToken: SENTINEL_ACCESS_TOKEN,
      accessExpiresAt: '2026-11-20T11:00:00.000Z',
      refreshToken: null,
      refreshExpiresAt: null,
      scopes: [],
      obtainedAt: '2026-11-20T10:00:00.000Z',
      extra: 1,
    };
    const extraField = new SecretToken(Buffer.from(JSON.stringify(storedWithExtraField), 'utf8').toString('base64url'));
    for (const encoded of [new SecretToken(''), new SecretToken('not base64url!'), notJson, extraField]) {
      assert.throws(
        () => decodeTokenBundle(encoded),
        (error: unknown) => error instanceof TokenBundleInvalidError && error.problem === 'corrupt' && sentinelsIn(error.message).length === 0,
      );
    }
  });

  it('asks for a refresh within five minutes of expiry, not before', () => {
    const bundle = { accessExpiresAt: '2026-11-20T11:00:00.000Z' };
    assert.equal(accessTokenNeedsRefresh(bundle, new Date('2026-11-20T10:54:59.000Z')), false);
    assert.equal(accessTokenNeedsRefresh(bundle, new Date('2026-11-20T10:55:00.000Z')), true);
    assert.equal(accessTokenNeedsRefresh(bundle, new Date('2026-11-20T11:30:00.000Z')), true);
  });
});

describe('InMemoryPlatformTokenVault', () => {
  it('answers not-found, then the written bundle, then deleted and not-found again', async () => {
    const vault = new InMemoryPlatformTokenVault();
    assert.deepEqual(await vault.read('youtube'), { status: 'not-found' });

    await vault.write(sentinelTokenBundle('youtube'));
    const found = await vault.read('youtube');
    assert.equal(found.status === 'found' ? found.bundle.accessToken.revealForPlatformCall() : null, SENTINEL_ACCESS_TOKEN);
    assert.equal(vault.has('youtube'), true);
    assert.equal(vault.has('tiktok'), false);

    assert.equal(await vault.delete('youtube'), 'deleted');
    assert.equal(await vault.delete('youtube'), 'not-found');
    assert.deepEqual(await vault.read('youtube'), { status: 'not-found' });
    assert.deepEqual(vault.operationCounts(), { reads: 3, writes: 1, deletes: 2 });
  });

  it('fails every call as an unreachable Keychain while failAll is on', async () => {
    const vault = new InMemoryPlatformTokenVault();
    vault.failAll(true);
    const unavailable = (operation: string) => (error: unknown) =>
      error instanceof TokenVaultUnavailableError && error.operation === operation && error.reason === 'keychain-unavailable';
    await assert.rejects(vault.read('youtube'), unavailable('read'));
    await assert.rejects(vault.write(sentinelTokenBundle('youtube')), unavailable('write'));
    await assert.rejects(vault.delete('youtube'), unavailable('delete'));
    assert.equal(vault.has('youtube'), false);

    vault.failAll(false);
    assert.deepEqual(await vault.read('youtube'), { status: 'not-found' });
  });

  it('refuses a bundle the Keychain item cannot hold as bundle-too-large and stores nothing', async () => {
    const vault = new InMemoryPlatformTokenVault();
    const bundle = sentinelTokenBundle('tiktok', { accessToken: new SecretToken('y'.repeat(MAX_TOKEN_TEXT_CHARS + 1)) });
    await assert.rejects(
      vault.write(bundle),
      (error: unknown) => error instanceof TokenVaultUnavailableError && error.failure === 'bundle-too-large',
    );
    assert.equal(vault.has('tiktok'), false);
  });
});
