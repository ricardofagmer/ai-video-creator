import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';

/** Absolute lifetime; a new login is needed after it, whatever the activity. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** Single user: a few browsers or tabs at most. The oldest session is dropped past this. */
const MAX_SESSIONS = 16;

/** `<selector>.<verifier>`: 16 random bytes and 32 random bytes, base64url. */
const TOKEN_PATTERN = /^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/;

interface SessionRecord {
  verifierDigest: Buffer;
  expiresAtMs: number;
}

export interface IssuedSession {
  token: string;
  sessionId: string;
  expiresAt: Date;
}

export interface ValidSession {
  sessionId: string;
  expiresAt: Date;
}

function digest(verifier: string): Buffer {
  return createHash('sha256').update(verifier, 'utf8').digest();
}

/**
 * In-memory sessions (D8). Tokens are random, never derived from the passphrase, and only a
 * digest of their secret part is kept. Lookup uses the public selector; the secret part is
 * compared in constant time. Restarting the api ends every session, which is acceptable for a
 * local single-user tool and avoids persisting bearer material anywhere.
 */
@Injectable()
export class SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  issue(nowMs: number): IssuedSession {
    this.dropExpired(nowMs);
    while (this.sessions.size >= MAX_SESSIONS) {
      const oldest = this.sessions.keys().next();
      if (oldest.done === true) break;
      this.sessions.delete(oldest.value);
    }
    const sessionId = randomBytes(16).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const expiresAtMs = nowMs + SESSION_TTL_MS;
    this.sessions.set(sessionId, { verifierDigest: digest(verifier), expiresAtMs });
    return { token: `${sessionId}.${verifier}`, sessionId, expiresAt: new Date(expiresAtMs) };
  }

  validate(token: string, nowMs: number): ValidSession | null {
    const match = TOKEN_PATTERN.exec(token);
    if (match === null) return null;
    const [, sessionId, verifier] = match;
    if (sessionId === undefined || verifier === undefined) return null;
    const record = this.sessions.get(sessionId);
    if (record === undefined) return null;
    if (record.expiresAtMs <= nowMs) {
      this.sessions.delete(sessionId);
      return null;
    }
    if (!timingSafeEqual(digest(verifier), record.verifierDigest)) return null;
    return { sessionId, expiresAt: new Date(record.expiresAtMs) };
  }

  revoke(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  private dropExpired(nowMs: number): void {
    for (const [sessionId, record] of this.sessions) {
      if (record.expiresAtMs <= nowMs) this.sessions.delete(sessionId);
    }
  }
}
