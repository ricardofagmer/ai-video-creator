import { Injectable, Logger } from '@nestjs/common';
import { InvalidPassphraseError } from '../platform/api.errors';
import { RequestContext } from '../platform/request-context';
import { LoginThrottle } from './login-throttle';
import { PassphraseVerifier } from './passphrase.verifier';
import { sessionTokensFrom } from './session-cookie';
import { SessionStore, type IssuedSession } from './session-store';

/** Login and logout. Logs carry outcomes and ids only: never the passphrase, a token or a cookie. */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly verifier: PassphraseVerifier,
    private readonly throttle: LoginThrottle,
    private readonly sessions: SessionStore,
    private readonly context: RequestContext,
  ) {}

  /**
   * A fresh session on every success (no client-chosen id is ever adopted, so no fixation); the
   * session the browser already held, if any, is revoked.
   */
  async login(passphrase: string, cookieHeader: string | undefined): Promise<IssuedSession> {
    const nowMs = Date.now();
    const outcome = await this.throttle.attempt(nowMs, () => this.verifier.verify(passphrase));
    const correlationId = this.context.correlationId();
    if (outcome === 'rejected') {
      this.logger.warn({ event: 'auth.login-rejected', correlationId });
      throw new InvalidPassphraseError();
    }
    this.revokePresented(cookieHeader, nowMs);
    const issued = this.sessions.issue(nowMs);
    this.logger.log({ event: 'auth.login-accepted', sessionId: issued.sessionId, correlationId });
    return issued;
  }

  logout(sessionId: string): void {
    this.sessions.revoke(sessionId);
    this.logger.log({ event: 'auth.logout', sessionId, correlationId: this.context.correlationId() });
  }

  private revokePresented(cookieHeader: string | undefined, nowMs: number): void {
    for (const token of sessionTokensFrom(cookieHeader)) {
      const session = this.sessions.validate(token, nowMs);
      if (session !== null) this.sessions.revoke(session.sessionId);
    }
  }
}
