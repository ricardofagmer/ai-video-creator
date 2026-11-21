import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { API_CONTRACT_REVISION, ApiRev7ErrorReasonSchema, apiRev7ErrorReasons } from './common';
import {
  ConnectionCallbackQuerySchema,
  ConnectionRedirectInvalidError,
  ConnectionStartViewSchema,
  GateChangeRequestSchema,
  PlatformParamsSchema,
  PlatformViewSchema,
  PlatformsViewSchema,
  connectionRedirectUri,
  connectionResultPagePath,
  pickConnectionCallbackQuery,
  type PlatformView,
} from './platforms';

/*
 * C10 rev 7 platform contracts (SPEC 0007 sections 4.4, 5.2 and 5.3; AC 39, AC 40). Every schema is
 * strict: an unknown field is refused, so no view can grow a token, code or account id unnoticed.
 */

function platformView(overrides: Partial<PlatformView> = {}): PlatformView {
  return {
    platform: 'youtube',
    mode: 'mock',
    gates: { metrics: 'enabled', publish: 'enabled' },
    status: { metrics: 'connected', publish: 'connected' },
    reconnectReason: null,
    accountLabel: 'Conta simulada',
    connectedAt: '2026-11-20T10:00:00.000Z',
    lastPollAt: null,
    backoff: null,
    trackedPublications: 0,
    importFallback: true,
    ...overrides,
  };
}

describe('rev 7 contract revision and reasons', () => {
  it('is revision 7', () => {
    assert.equal(API_CONTRACT_REVISION, 7);
  });

  it('maps every rev 7 reason to the status section 4.4 names', () => {
    for (const reason of ApiRev7ErrorReasonSchema.options) assert.equal(typeof apiRev7ErrorReasons[reason], 'number');
    assert.equal(apiRev7ErrorReasons['oauth-state-invalid'], 400);
    assert.equal(apiRev7ErrorReasons['oauth-exchange-failed'], 502);
    assert.equal(apiRev7ErrorReasons['keychain-unavailable'], 503);
    assert.equal(apiRev7ErrorReasons['publish-visibility-not-allowed'], 422);
    assert.equal(apiRev7ErrorReasons['publish-attempt-not-found'], 404);
    assert.equal(apiRev7ErrorReasons['platform-publish-unsupported'], 409);
    assert.equal(apiRev7ErrorReasons['publish-already-in-progress'], 409);
  });
});

describe('platform route schemas', () => {
  it('parses the documented params and gate change and refuses extra fields', () => {
    assert.equal(PlatformParamsSchema.safeParse({ platform: 'tiktok' }).success, true);
    assert.equal(PlatformParamsSchema.safeParse({ platform: 'facebook' }).success, false);
    assert.equal(GateChangeRequestSchema.safeParse({ capability: 'publish', state: 'enabled' }).success, true);
    assert.equal(
      GateChangeRequestSchema.safeParse({ capability: 'publish', state: 'enabled', updatedBy: 'someone' }).success,
      false,
    );
  });

  it('parses a platform view and refuses a token field or a false importFallback', () => {
    assert.equal(PlatformViewSchema.safeParse(platformView()).success, true);
    assert.equal(PlatformViewSchema.safeParse({ ...platformView(), accessToken: 'x' }).success, false);
    assert.equal(PlatformViewSchema.safeParse({ ...platformView(), platformAccountId: 'mock-youtube' }).success, false);
    assert.equal(PlatformViewSchema.safeParse({ ...platformView(), importFallback: false }).success, false);
  });

  it('requires all three platforms, each exactly once', () => {
    const three = [platformView(), platformView({ platform: 'instagram' }), platformView({ platform: 'tiktok' })];
    assert.equal(PlatformsViewSchema.safeParse({ platforms: three }).success, true);
    assert.equal(PlatformsViewSchema.safeParse({ platforms: three.slice(0, 2) }).success, false);
    assert.equal(
      PlatformsViewSchema.safeParse({ platforms: [platformView(), platformView(), platformView({ platform: 'tiktok' })] })
        .success,
      false,
    );
  });

  it('accepts an https authorize URL or the loopback callback and refuses anything else', () => {
    const expiresAt = '2026-11-20T10:10:00.000Z';
    const accepts = (authorizeUrl: string): boolean => ConnectionStartViewSchema.safeParse({ authorizeUrl, expiresAt }).success;
    assert.equal(accepts('https://accounts.google.com/o/oauth2/v2/auth?client_id=x'), true);
    assert.equal(accepts('http://127.0.0.1:4000/platforms/youtube/connection/callback?code=c&state=s'), true);
    assert.equal(accepts('http://localhost:4000/platforms/youtube/connection/callback'), false);
    assert.equal(accepts('http://accounts.example.invalid/auth'), false);
    assert.equal(accepts('https://user:secret@accounts.example.invalid/auth'), false);
    assert.equal(accepts('javascript:alert(1)'), false);
    assert.equal(accepts('not a url'), false);
  });
});

describe('connection callback query', () => {
  const state = 'AbCdEfGhIjKlMnOpQrStUv_-0123456789abcdefghi';

  it('keeps only code, state and error before the strict schema runs', () => {
    const picked = pickConnectionCallbackQuery({ code: 'abc', state, scope: 'openid', authuser: '0', error_description: 'x' });
    assert.deepEqual(picked, { code: 'abc', state });
    assert.equal(ConnectionCallbackQuerySchema.safeParse(picked).success, true);
  });

  it('refuses a repeated parameter, a short state and a code with spaces', () => {
    assert.equal(ConnectionCallbackQuerySchema.safeParse(pickConnectionCallbackQuery({ code: ['a', 'b'], state })).success, false);
    assert.equal(ConnectionCallbackQuerySchema.safeParse({ code: 'abc', state: 'short' }).success, false);
    assert.equal(ConnectionCallbackQuerySchema.safeParse({ code: 'a b', state }).success, false);
    assert.equal(ConnectionCallbackQuerySchema.safeParse({ code: 'a'.repeat(2049), state }).success, false);
  });

  it('parses an error-only callback', () => {
    assert.equal(ConnectionCallbackQuerySchema.safeParse({ error: 'access_denied' }).success, true);
  });

  it('refuses unknown fields when called without the picker', () => {
    assert.equal(ConnectionCallbackQuerySchema.safeParse({ code: 'abc', state, scope: 'openid' }).success, false);
  });
});

describe('connection redirect and result page', () => {
  it('builds the exact loopback redirect URI (AC 39)', () => {
    assert.equal(
      connectionRedirectUri({ apiPort: 4000, platform: 'instagram' }),
      'http://127.0.0.1:4000/platforms/instagram/connection/callback',
    );
  });

  it('refuses a port outside 1-65535 or an unknown platform', () => {
    for (const apiPort of [0, 65_536, 80.5, -1]) {
      assert.throws(
        () => connectionRedirectUri({ apiPort, platform: 'youtube' }),
        (error: unknown) => error instanceof ConnectionRedirectInvalidError && error.field === 'apiPort',
      );
    }
    assert.throws(
      () => Reflect.apply(connectionRedirectUri, undefined, [{ apiPort: 4000, platform: '../admin' }]),
      (error: unknown) => error instanceof ConnectionRedirectInvalidError && error.field === 'platform',
    );
  });

  it('builds the /contas result path with an optional reason', () => {
    assert.equal(connectionResultPagePath({ resultado: 'conectada' }), '/contas?resultado=conectada');
    assert.equal(
      connectionResultPagePath({ resultado: 'falhou', motivo: 'oauth-state-invalid' }),
      '/contas?resultado=falhou&motivo=oauth-state-invalid',
    );
  });
});
