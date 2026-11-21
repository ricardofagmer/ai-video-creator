import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { type Platform } from '@studio/shared/platforms';
import { MOCK_TIKTOK_HANDLE, mockTiktokVideoId, mockYoutubeVideoId } from '../clients/mock/mock-data';
import { MockPlatformClient, type MockPlatformProfile } from '../clients/mock/mock-platform-client';
import { mockPlatformProfiles } from '../clients/mock/mock-profiles';
import { PlatformClientRegistry, type PlatformClients } from '../clients/platform-client.registry';
import { type PlatformModeSettings } from '../platform-modes.config';
import { PlatformRefusedError } from '../platforms.errors';
import { AccountStore } from '../stores/platform-file.stores';
import { PublicationLinker } from './publication-linker';

/*
 * The canonical URL rebuild of a published attempt (SPEC 0007 section 5.4 "Result"): the client
 * builds it, `parsePublicationUrl` checks it, and a URL that does not round-trip to the same
 * platform and video id is never stored. A platform the registry refuses is skipped, not guessed.
 */

const ATTEMPT_ID = '01JD2Q7F3M8V5K9X4T6R2N0B1C';

const allMock: PlatformModeSettings = {
  youtube: { mode: 'mock', fault: 'none' },
  instagram: { mode: 'mock', fault: 'none' },
  tiktok: { mode: 'mock', fault: 'none' },
};

/** A live context whose fetch fails loudly: no test here may reach the network. */
const offlineContext = {
  fetch: async (): Promise<Response> => {
    throw new Error('network is not allowed in this test');
  },
};

class FixedClients implements PlatformClients {
  constructor(private readonly profile: MockPlatformProfile) {}

  clientFor(): MockPlatformClient {
    return new MockPlatformClient(this.profile, 'none');
  }
}

describe('PublicationLinker.planUrl', () => {
  let root: string;
  let accounts: AccountStore;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'studio-core-publication-url-'));
    const platformRoot = join(root, 'platform');
    await mkdir(platformRoot);
    accounts = new AccountStore(platformRoot);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('rebuilds the canonical YouTube watch URL', async () => {
    const linker = new PublicationLinker(new PlatformClientRegistry(allMock, offlineContext), accounts);
    const videoId = mockYoutubeVideoId(ATTEMPT_ID);

    assert.deepEqual(await linker.planUrl('youtube', videoId), {
      status: 'ready',
      platformVideoId: videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    });
  });

  it('rebuilds the canonical TikTok URL with the handle', async () => {
    const linker = new PublicationLinker(new PlatformClientRegistry(allMock, offlineContext), accounts);
    const videoId = mockTiktokVideoId(ATTEMPT_ID);

    assert.deepEqual(await linker.planUrl('tiktok', videoId), {
      status: 'ready',
      platformVideoId: videoId,
      url: `https://www.tiktok.com/@${MOCK_TIKTOK_HANDLE}/video/${videoId}`,
    });
  });

  it('rebuilds the canonical Instagram reel URL', async () => {
    const linker = new PublicationLinker(new PlatformClientRegistry(allMock, offlineContext), accounts);
    const plan = await linker.planUrl('instagram', 'Cx1_ab-Z9');
    assert.deepEqual(plan, { status: 'ready', platformVideoId: 'Cx1_ab-Z9', url: 'https://www.instagram.com/reel/Cx1_ab-Z9/' });
  });

  it('skips a video id the platform pattern refuses', async () => {
    const linker = new PublicationLinker(new PlatformClientRegistry(allMock, offlineContext), accounts);
    assert.deepEqual(await linker.planUrl('youtube', 'too-short'), { status: 'skipped', reason: 'url-not-buildable' });
    assert.deepEqual(await linker.planUrl('tiktok', 'abc'), { status: 'skipped', reason: 'url-not-buildable' });
  });

  it('skips a built URL that names another platform or another video', async () => {
    const otherPlatform: MockPlatformProfile = {
      ...mockPlatformProfiles.youtube,
      publicationUrl: (videoId) => `https://www.instagram.com/reel/${videoId}/`,
    };
    const otherVideo: MockPlatformProfile = {
      ...mockPlatformProfiles.youtube,
      publicationUrl: () => 'https://www.youtube.com/watch?v=AAAAAAAAAAA',
    };
    const videoId = mockYoutubeVideoId(ATTEMPT_ID);

    assert.deepEqual(await new PublicationLinker(new FixedClients(otherPlatform), accounts).planUrl('youtube', videoId), {
      status: 'skipped',
      reason: 'url-not-buildable',
    });
    assert.deepEqual(await new PublicationLinker(new FixedClients(otherVideo), accounts).planUrl('youtube', videoId), {
      status: 'skipped',
      reason: 'url-not-buildable',
    });
  });

  it('skips when the client cannot build a URL at all', async () => {
    const noUrl: MockPlatformProfile = { ...mockPlatformProfiles.tiktok, publicationUrl: () => null };
    const plan = await new PublicationLinker(new FixedClients(noUrl), accounts).planUrl('tiktok', mockTiktokVideoId(ATTEMPT_ID));
    assert.deepEqual(plan, { status: 'skipped', reason: 'url-not-buildable' });
  });

  it('rebuilds the URL with the delivered live clients, offline, and skips TikTok', async () => {
    const youtubeId = mockYoutubeVideoId(ATTEMPT_ID);
    const instagramShortcode = 'DAbCdEf1234';
    const cases: readonly { platform: Platform; videoId: string; expected: unknown }[] = [
      { platform: 'youtube', videoId: youtubeId, expected: { status: 'ready', platformVideoId: youtubeId, url: `https://www.youtube.com/watch?v=${youtubeId}` } },
      {
        platform: 'instagram',
        videoId: instagramShortcode,
        expected: { status: 'ready', platformVideoId: instagramShortcode, url: `https://www.instagram.com/reel/${instagramShortcode}/` },
      },
      // The live TikTok label is a display name, not a handle, so no URL is built from it.
      { platform: 'tiktok', videoId: mockTiktokVideoId(ATTEMPT_ID), expected: { status: 'skipped', reason: 'url-not-buildable' } },
    ];
    for (const { platform, videoId, expected } of cases) {
      const liveOne: PlatformModeSettings = { ...allMock, [platform]: { mode: 'live' } };
      const linker = new PublicationLinker(new PlatformClientRegistry(liveOne, offlineContext), accounts);
      assert.deepEqual(await linker.planUrl(platform, videoId), expected, platform);
    }
  });

  it('skips as client-unavailable when the registry refuses the platform', async () => {
    const refusing: PlatformClients = {
      clientFor: (platform) => {
        throw new PlatformRefusedError('platform-not-configured', platform);
      },
    };
    const plan = await new PublicationLinker(refusing, accounts).planUrl('youtube', mockYoutubeVideoId(ATTEMPT_ID));
    assert.deepEqual(plan, { status: 'skipped', reason: 'client-unavailable' });
  });
});
