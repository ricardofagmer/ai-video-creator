import { Inject, Injectable } from '@nestjs/common';
import { type Platform } from '@studio/shared/platforms';
import { PLATFORM_MODE_SETTINGS, type PlatformModeSettings } from '../platform-modes.config';
import { PlatformRefusedError } from '../platforms.errors';
import { instagramLiveClientFactory } from './instagram';
import { type LivePlatformClientContext, type LivePlatformClientFactory } from './live-client-factory';
import { MockPlatformClient } from './mock/mock-platform-client';
import { mockPlatformProfiles } from './mock/mock-profiles';
import { type PlatformClient } from './platform-client.port';
import { tiktokLiveClientFactory } from './tiktok';
import { youtubeLiveClientFactory } from './youtube';

/**
 * The live client folders bound by platform (SPEC 0007 section 9: R4-02 creates the folders and the
 * registry that binds them). A null binding means that live client is not delivered yet.
 */
export const livePlatformClientFactories: Readonly<Record<Platform, LivePlatformClientFactory | null>> = Object.freeze({
  youtube: youtubeLiveClientFactory,
  instagram: instagramLiveClientFactory,
  tiktok: tiktokLiveClientFactory,
});

/** Picks the client of each platform for this process's mode. Tests bind their own registry. */
export interface PlatformClients {
  /** Throws `PlatformRefusedError('platform-not-configured')` when live mode has no client yet. */
  clientFor(platform: Platform): PlatformClient;
}

/** Nest token for `PlatformClients`; production binds `PlatformClientRegistry`. */
export const PLATFORM_CLIENTS = Symbol('PLATFORM_CLIENTS');

/** Nest token for the live clients' context (Node's global `fetch`). */
export const LIVE_PLATFORM_CLIENT_CONTEXT = Symbol('LIVE_PLATFORM_CLIENT_CONTEXT');

/**
 * Mock mode (the default) gives the offline `MockPlatformClient` with the configured fault; live
 * mode gives the bound live client, built once. With every platform in mock mode no live client is
 * ever built, so the process makes zero outbound requests (section 5.8).
 */
@Injectable()
export class PlatformClientRegistry implements PlatformClients {
  private readonly clients = new Map<Platform, PlatformClient>();

  constructor(
    @Inject(PLATFORM_MODE_SETTINGS) private readonly modes: PlatformModeSettings,
    @Inject(LIVE_PLATFORM_CLIENT_CONTEXT) private readonly liveContext: LivePlatformClientContext,
  ) {}

  clientFor(platform: Platform): PlatformClient {
    const known = this.clients.get(platform);
    if (known !== undefined) return known;
    const client = this.build(platform);
    this.clients.set(platform, client);
    return client;
  }

  private build(platform: Platform): PlatformClient {
    const state = this.modes[platform];
    if (state.mode === 'mock') return new MockPlatformClient(mockPlatformProfiles[platform], state.fault);
    const factory = livePlatformClientFactories[platform];
    if (factory === null) throw new PlatformRefusedError('platform-not-configured', platform);
    return factory(this.liveContext);
  }
}
