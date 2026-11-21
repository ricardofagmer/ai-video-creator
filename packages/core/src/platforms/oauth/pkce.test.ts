import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { ConnectionCallbackQuerySchema } from '@studio/shared/api';
import { SecretToken } from '../token-bundle';
import { createOAuthState, createPkceVerifier, pkceChallenge } from './pkce';

/*
 * PKCE and `state` (SPEC 0007 section 5.2, AC 39): S256 in base64url (YouTube) or hex (TikTok),
 * none for Instagram; `state` is 32 random bytes in base64url. The RFC 7636 appendix B vector pins
 * the base64url encoding.
 */

const RFC_7636_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const RFC_7636_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

describe('PKCE verifier and challenge', () => {
  it('matches the RFC 7636 appendix B challenge in base64url', () => {
    assert.equal(pkceChallenge(new SecretToken(RFC_7636_VERIFIER), 'base64url'), RFC_7636_CHALLENGE);
  });

  it('encodes the same sha-256 as lowercase hex for TikTok', () => {
    const expected = createHash('sha256').update(RFC_7636_VERIFIER, 'ascii').digest('hex');
    const challenge = pkceChallenge(new SecretToken(RFC_7636_VERIFIER), 'hex');
    assert.equal(challenge, expected);
    assert.match(challenge ?? '', /^[0-9a-f]{64}$/);
    assert.equal(Buffer.from(challenge ?? '', 'hex').toString('base64url'), RFC_7636_CHALLENGE);
  });

  it('answers no challenge where the platform offers no PKCE', () => {
    assert.equal(pkceChallenge(new SecretToken(RFC_7636_VERIFIER), 'none'), null);
  });

  it('creates 64-character verifiers in the RFC 7636 unreserved set, each one different', () => {
    const first = createPkceVerifier();
    const second = createPkceVerifier();
    assert.equal(first.length, 64);
    assert.match(first.revealForPlatformCall(), /^[A-Za-z0-9_-]{64}$/);
    assert.notEqual(first.revealForPlatformCall(), second.revealForPlatformCall());
  });

  it('keeps the verifier redacted in every stringification', () => {
    const verifier = createPkceVerifier();
    const raw = verifier.revealForPlatformCall();
    assert.equal(String(verifier), '<redacted>');
    assert.equal(`${verifier}`, '<redacted>');
    assert.equal(JSON.stringify({ verifier }).includes(raw), false);
  });
});

describe('OAuth state', () => {
  it('creates a 43-character base64url state that the callback schema accepts', () => {
    const state = createOAuthState();
    assert.match(state, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(ConnectionCallbackQuerySchema.safeParse({ state, code: 'c' }).success, true);
  });

  it('never repeats a state across many draws', () => {
    const states = new Set(Array.from({ length: 200 }, () => createOAuthState()));
    assert.equal(states.size, 200);
  });
});
