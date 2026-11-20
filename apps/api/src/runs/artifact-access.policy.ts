import { type RunArtifactAccess } from '@studio/shared/api';
import { artifactContentTypeOf, isDocumentContentType } from './artifact-content-type';

/** The one media artifact a `playable-biometric` run serves (owner decision "Play for logged-in owner"). */
const FINAL_VIDEO_PATH = 'final.mp4';

/**
 * The artifact table of SPEC 0002 rev 4, section 13.5 (A26):
 *
 * | `artifactAccess` | `final.mp4` | Other media | JSON and text |
 * |---|---|---|---|
 * | `playable` | served | served | served |
 * | `playable-biometric` | served | refused | served |
 * | `withheld` | refused | refused | served |
 *
 * "Media" is read fail-closed: any artifact that is not served as JSON or text counts, so an
 * octet-stream attachment (an audio format outside the inline table) is refused like `audio/*`.
 * A refusal is answered as `artifact-not-found` (404) by the caller.
 */
export function isArtifactServable(access: RunArtifactAccess, relativePath: string): boolean {
  const fileName = relativePath.slice(relativePath.lastIndexOf('/') + 1);
  if (isDocumentContentType(artifactContentTypeOf(fileName).contentType)) return true;
  if (access === 'playable') return true;
  if (access === 'playable-biometric') return relativePath === FINAL_VIDEO_PATH;
  return false;
}
