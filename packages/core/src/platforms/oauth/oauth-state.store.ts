import { Injectable } from '@nestjs/common';
import { oauthBounds, type Platform, type PlatformCapability, type PlatformMode } from '@studio/shared/platforms';
import { type SecretToken } from '../token-bundle';

/*
 * The pending OAuth `state` entries (SPEC 0007 section 5.2): api memory only, bound to the session
 * id, single use, 10 minutes, at most 5 pending. A `state` is never written to a file or a log.
 */

/** What `StartConnection` remembers for the callback. */
export interface PendingConnection {
  platform: Platform;
  sessionId: string;
  mode: PlatformMode;
  verifier: SecretToken;
  /** Capabilities whose gate was `enabled` at start; the scopes requested for them. */
  capabilities: PlatformCapability[];
  scopes: string[];
  expiresAt: Date;
}

/** `found`: the entry, now consumed. `invalid`: unknown, used, expired, other platform or other session. */
export type ConsumedState = { status: 'found'; pending: PendingConnection } | { status: 'invalid' };

export interface OAuthStateStore {
  /** Remembers `pending` under `state`; the oldest entry is dropped beyond `maxPendingStates`. */
  issue(state: string, pending: PendingConnection, now: Date): void;
  /** Removes and returns the entry when it is unexpired and bound to `platform` and `sessionId`. */
  consume(request: { state: string; platform: Platform; sessionId: string; now: Date }): ConsumedState;
}

/** Nest token; the in-memory store is the only implementation (the api is one process). */
export const OAUTH_STATE_STORE = Symbol('OAUTH_STATE_STORE');

/**
 * `OAuthStateStore` in process memory. Any presented `state` that matches an entry consumes it,
 * even on a platform or session mismatch, so a leaked `state` cannot be tried twice.
 */
@Injectable()
export class InMemoryOAuthStateStore implements OAuthStateStore {
  private readonly pending = new Map<string, PendingConnection>();

  issue(state: string, pending: PendingConnection, now: Date): void {
    this.dropExpired(now);
    this.pending.set(state, pending);
    while (this.pending.size > oauthBounds.maxPendingStates) {
      const oldest = this.pending.keys().next();
      if (oldest.done === true) break;
      this.pending.delete(oldest.value);
    }
  }

  consume(request: { state: string; platform: Platform; sessionId: string; now: Date }): ConsumedState {
    this.dropExpired(request.now);
    const pending = this.pending.get(request.state);
    if (pending === undefined) return { status: 'invalid' };
    this.pending.delete(request.state);
    if (pending.platform !== request.platform || pending.sessionId !== request.sessionId) return { status: 'invalid' };
    return { status: 'found', pending };
  }

  private dropExpired(now: Date): void {
    for (const [state, pending] of this.pending) {
      if (pending.expiresAt.getTime() <= now.getTime()) this.pending.delete(state);
    }
  }
}
