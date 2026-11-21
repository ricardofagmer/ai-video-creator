import { type Platform } from '@studio/shared/platforms';
import { MOCK_TIKTOK_HANDLE, mockTiktokVideoId, mockYoutubeVideoId } from './mock-data';
import { type MockPlatformProfile } from './mock-platform-client';

/*
 * The three mock profiles (SPEC 0007 sections 5.2, 5.4 and 5.8). Scopes are the section 5.2
 * minimal scopes as data; the live clients (R4-07 to R4-09) carry the platforms' exact strings.
 */

/** YouTube: PKCE base64url; the upload is `processing`, then `published` on the first status check. */
const youtubeProfile: MockPlatformProfile = {
  platform: 'youtube',
  pkce: 'base64url',
  identityScopes: ['youtube.readonly'],
  capabilityScopes: { metrics: ['youtube.readonly', 'yt-analytics.readonly'], publish: ['youtube.upload'] },
  finishUpload: (attemptId) => ({ state: 'processing', uploadRef: mockYoutubeVideoId(attemptId) }),
  statusAfterUpload: (uploadRef, now) => ({ state: 'published', platformVideoId: uploadRef, platformMediaId: null, publishedAt: now.toISOString() }),
  publicationUrl: (platformVideoId) => `https://www.youtube.com/watch?v=${platformVideoId}`,
  rotatesRefreshToken: false,
};

/** Instagram: metrics only (OD8); publishing answers `account-not-eligible` and sends nothing. */
const instagramProfile: MockPlatformProfile = {
  platform: 'instagram',
  pkce: 'none',
  identityScopes: ['instagram_business_basic'],
  capabilityScopes: { metrics: ['instagram_business_manage_insights'], publish: [] },
  finishUpload: () => null,
  statusAfterUpload: () => ({ state: 'failed', reasonId: 'account-not-eligible' }),
  publicationUrl: (platformVideoId) => `https://www.instagram.com/reel/${platformVideoId}/`,
  rotatesRefreshToken: false,
};

/**
 * TikTok: PKCE hex [T1]; the upload lands in the inbox (OD6), and the follow-up status reports
 * `PUBLISH_COMPLETE` with a public post id, so the mock path reaches `published`.
 */
const tiktokProfile: MockPlatformProfile = {
  platform: 'tiktok',
  pkce: 'hex',
  identityScopes: ['user.info.basic'],
  capabilityScopes: { metrics: ['video.list'], publish: ['video.upload'] },
  finishUpload: (attemptId) => ({ state: 'sent-to-inbox', uploadRef: mockTiktokVideoId(attemptId) }),
  statusAfterUpload: (uploadRef, now) => ({ state: 'published', platformVideoId: uploadRef, platformMediaId: null, publishedAt: now.toISOString() }),
  publicationUrl: (platformVideoId) => `https://www.tiktok.com/@${MOCK_TIKTOK_HANDLE}/video/${platformVideoId}`,
  rotatesRefreshToken: true,
};

export const mockPlatformProfiles: Readonly<Record<Platform, MockPlatformProfile>> = Object.freeze({
  youtube: youtubeProfile,
  instagram: instagramProfile,
  tiktok: tiktokProfile,
});
