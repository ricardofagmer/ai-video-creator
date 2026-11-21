import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { connectionRedirectUri, type ConnectionStartView } from '@studio/shared/api';
import { oauthBounds, PlatformCapabilitySchema, type PlatformCapability } from '@studio/shared/platforms';
import { PLATFORM_CLIENTS, type PlatformClients } from '../clients/platform-client.registry';
import { OAUTH_STATE_STORE, type OAuthStateStore } from '../oauth/oauth-state.store';
import { createOAuthState, createPkceVerifier, pkceChallenge } from '../oauth/pkce';
import { PlatformCredentials } from '../platform-credentials';
import { PlatformRefusedError } from '../platforms.errors';
import { StartConnectionInputSchema, parsePlatformInput } from '../platforms.input';
import { PLATFORM_CLOCK, type PlatformClock } from '../platform-runtime';
import { PlatformStatusReader } from '../platform-status.reader';
import { StartConnectionCommand } from './platform.commands';

/**
 * SPEC 0007 section 5.2 step 1. Refuses when no capability is `enabled` (`platform-awaiting-review`)
 * or the client credentials are missing (`platform-not-configured`, live mode only). Creates a
 * 32-byte `state` and a 64-character PKCE verifier, kept in api memory only and bound to the
 * session, and returns the platform's authorize URL with the minimal scopes of the enabled
 * capabilities. In mock mode the URL is the api's own callback (section 5.8). Writes no file and
 * makes no platform call; the `state`, the verifier and the URL are never logged (K7).
 */
@CommandHandler(StartConnectionCommand)
export class StartConnectionHandler implements ICommandHandler<StartConnectionCommand, ConnectionStartView> {
  private readonly logger = new Logger(StartConnectionHandler.name);

  constructor(
    @Inject(PLATFORM_CLOCK) private readonly clock: PlatformClock,
    @Inject(PLATFORM_CLIENTS) private readonly clients: PlatformClients,
    @Inject(OAUTH_STATE_STORE) private readonly states: OAuthStateStore,
    private readonly statusReader: PlatformStatusReader,
    private readonly credentials: PlatformCredentials,
  ) {}

  async execute(command: StartConnectionCommand): Promise<ConnectionStartView> {
    const { platform, sessionId, apiPort, correlationId } = parsePlatformInput(StartConnectionInputSchema, command.input);
    try {
      const snapshot = await this.statusReader.snapshot(platform);
      const capabilities: PlatformCapability[] = PlatformCapabilitySchema.options.filter(
        (capability) => snapshot.gates[capability] === 'enabled' && snapshot.status[capability] !== 'unsupported',
      );
      if (capabilities.length === 0) throw new PlatformRefusedError('platform-awaiting-review', platform);
      const lookup = snapshot.mode === 'live' ? await this.credentials.lookup(platform) : null;
      if (lookup !== null && lookup.status === 'missing') throw new PlatformRefusedError('platform-not-configured', platform);
      const client = this.clients.clientFor(platform);

      const now = this.clock.now();
      const expiresAt = new Date(now.getTime() + oauthBounds.stateTtlMs);
      const state = createOAuthState();
      const verifier = createPkceVerifier();
      const scopes = client.scopesFor(capabilities);
      const redirectUri = connectionRedirectUri({ apiPort, platform });
      const authorizeUrl = client.authorizeUrl({
        // Line 44 refused a missing lookup, so only mock mode (no lookup, no credential) is null here.
        credentials: lookup === null ? null : lookup.credentials,
        redirectUri,
        state,
        challenge: pkceChallenge(verifier, client.pkce),
        scopes,
      });
      this.states.issue(state, { platform, sessionId, mode: snapshot.mode, verifier, capabilities, scopes, expiresAt }, now);
      this.logger.log({ event: 'platform.connect-started', platform, mode: snapshot.mode, capabilities, correlationId });
      return { authorizeUrl, expiresAt: expiresAt.toISOString() };
    } catch (error) {
      if (error instanceof PlatformRefusedError) {
        this.logger.log({ event: 'platform.connect-refused', platform, reason: error.reason, correlationId });
      }
      throw error;
    }
  }
}
