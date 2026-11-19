import { type Platform } from '@studio/shared/metrics';
import { instagramProfile } from './instagram.profile';
import { type PlatformProfile } from './platform-profile';
import { tiktokProfile } from './tiktok.profile';
import { youtubeProfile } from './youtube.profile';

export { type PlatformProfile, type ProfileColumn } from './platform-profile';

/** One parser profile per platform (OD3), all mapping to the one `PlatformMetrics` shape. */
export const platformProfiles: Readonly<Record<Platform, PlatformProfile>> = Object.freeze({
  youtube: youtubeProfile,
  instagram: instagramProfile,
  tiktok: tiktokProfile,
});
