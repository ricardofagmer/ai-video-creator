import { provisionalPlatformColumnAliases } from '@studio/shared/metrics';
import { buildPlatformProfile, type PlatformProfile } from './platform-profile';

/**
 * Meta Business Suite Insights content export (SPEC 0006 section 5.3): rows match by the post URL
 * in `Permalink`, read through `parsePublicationUrl`; `Post ID` is a numeric media id and is never
 * used for matching. A UTF-16 file is refused as not UTF-8. Aliases are provisional until the
 * owner's real header row arrives (Q7).
 */
export const instagramProfile: PlatformProfile = buildPlatformProfile(provisionalPlatformColumnAliases.instagram);
