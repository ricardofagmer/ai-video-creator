import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { oauthBounds, type Platform } from '@studio/shared/platforms';
import { SecretToken } from '../token-bundle';
import { InMemoryOAuthStateStore, type PendingConnection } from './oauth-state.store';

/*
 * Pending OAuth states (SPEC 0007 section 5.2, AC 40): single use, 10 minutes, bound to the session
 * and the platform, at most 5 pending. A state that matches is consumed even on a mismatch.
 */

const ISSUED_AT = new Date('2026-11-20T10:00:00.000Z');
const SESSION = 'session-owner';

function pending(overrides: Partial<PendingConnection> = {}): PendingConnection {
  return {
    platform: 'youtube',
    sessionId: SESSION,
    mode: 'mock',
    verifier: new SecretToken('test-verifier-not-a-real-secret'),
    capabilities: ['metrics'],
    scopes: ['scope-metrics'],
    expiresAt: new Date(ISSUED_AT.getTime() + oauthBounds.stateTtlMs),
    ...overrides,
  };
}

function after(ms: number): Date {
  return new Date(ISSUED_AT.getTime() + ms);
}

function consume(store: InMemoryOAuthStateStore, state: string, options: { platform?: Platform; sessionId?: string; now?: Date } = {}): string {
  return store.consume({
    state,
    platform: options.platform ?? 'youtube',
    sessionId: options.sessionId ?? SESSION,
    now: options.now ?? after(1_000),
  }).status;
}

describe('InMemoryOAuthStateStore', () => {
  it('uses a ten-minute life and five pending entries', () => {
    assert.equal(oauthBounds.stateTtlMs, 600_000);
    assert.equal(oauthBounds.maxPendingStates, 5);
  });

  it('returns the pending connection once, then answers invalid for the reused state', () => {
    const store = new InMemoryOAuthStateStore();
    const entry = pending();
    store.issue('state-a', entry, ISSUED_AT);

    const first = store.consume({ state: 'state-a', platform: 'youtube', sessionId: SESSION, now: after(1_000) });
    assert.deepEqual(first, { status: 'found', pending: entry });
    assert.equal(consume(store, 'state-a'), 'invalid');
  });

  it('answers invalid for an unknown state', () => {
    const store = new InMemoryOAuthStateStore();
    store.issue('state-a', pending(), ISSUED_AT);
    assert.equal(consume(store, 'state-unknown'), 'invalid');
    assert.equal(consume(store, 'state-a'), 'found');
  });

  it('expires a state at exactly ten minutes, valid one millisecond before', () => {
    const store = new InMemoryOAuthStateStore();
    store.issue('state-early', pending(), ISSUED_AT);
    store.issue('state-late', pending(), ISSUED_AT);

    assert.equal(consume(store, 'state-early', { now: after(oauthBounds.stateTtlMs - 1) }), 'found');
    assert.equal(consume(store, 'state-late', { now: after(oauthBounds.stateTtlMs) }), 'invalid');
  });

  it('refuses another session and consumes the state, so the right session cannot use it after', () => {
    const store = new InMemoryOAuthStateStore();
    store.issue('state-a', pending(), ISSUED_AT);

    assert.equal(consume(store, 'state-a', { sessionId: 'session-attacker' }), 'invalid');
    assert.equal(consume(store, 'state-a'), 'invalid');
  });

  it('refuses another platform and consumes the state', () => {
    const store = new InMemoryOAuthStateStore();
    store.issue('state-a', pending(), ISSUED_AT);

    assert.equal(consume(store, 'state-a', { platform: 'tiktok' }), 'invalid');
    assert.equal(consume(store, 'state-a'), 'invalid');
  });

  it('keeps at most five pending states and drops the oldest first', () => {
    const store = new InMemoryOAuthStateStore();
    for (let index = 0; index < 6; index += 1) store.issue(`state-${index}`, pending(), after(index));

    assert.equal(consume(store, 'state-0'), 'invalid');
    for (let index = 1; index < 6; index += 1) assert.equal(consume(store, `state-${index}`), 'found', `state-${index}`);
  });

  it('drops expired entries before counting, so they never evict a live one', () => {
    const store = new InMemoryOAuthStateStore();
    for (let index = 0; index < 5; index += 1) {
      store.issue(`old-${index}`, pending({ expiresAt: after(1_000) }), ISSUED_AT);
    }
    store.issue('live-a', pending({ expiresAt: after(oauthBounds.stateTtlMs + 5_000) }), after(5_000));

    assert.equal(consume(store, 'live-a', { now: after(6_000) }), 'found');
  });
});
