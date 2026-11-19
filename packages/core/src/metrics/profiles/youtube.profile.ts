import { provisionalPlatformColumnAliases } from '@studio/shared/metrics';
import { buildPlatformProfile, type PlatformProfile } from './platform-profile';

/**
 * YouTube Studio Advanced Mode "Export current view", table CSV (SPEC 0006 section 5.3): the
 * `Content` column holds the 11-character video id, and a first `Total` row is skipped. A zip
 * download is refused by signature; the owner uploads the table CSV inside it. Aliases are
 * provisional until the owner's real header row arrives (Q7).
 */
export const youtubeProfile: PlatformProfile = buildPlatformProfile(provisionalPlatformColumnAliases.youtube);
