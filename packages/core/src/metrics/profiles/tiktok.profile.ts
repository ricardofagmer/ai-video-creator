import { provisionalPlatformColumnAliases } from '@studio/shared/metrics';
import { buildPlatformProfile, type PlatformProfile } from './platform-profile';

/**
 * TikTok web analytics download (SPEC 0006 section 5.3). Whether the export carries a video link
 * column at all is unverified; until the owner's real header row arrives (Q7) the id column name is
 * a placeholder, and without a usable id column TikTok works through the manual form only.
 */
export const tiktokProfile: PlatformProfile = buildPlatformProfile(provisionalPlatformColumnAliases.tiktok);
