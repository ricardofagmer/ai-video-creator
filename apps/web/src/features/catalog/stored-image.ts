import { apiPaths, type AssetVersionView } from '@studio/shared/api';
import { BFF_PREFIX } from '@/lib/api/browser';

/** The api serves only these as thumbnails (core `GetImageContentHandler`). */
const PREVIEWABLE_IMAGE_TYPES: ReadonlySet<string> = new Set(['image/png', 'image/jpeg', 'image/webp']);

/**
 * Same-origin thumbnail URL of an uploaded image, through the BFF. Null for a by-reference image:
 * the web never reads a typed reference path.
 */
export function storedImageHref(version: AssetVersionView): string | null {
  if (version.kind !== 'image' || version.layout !== 'file' || version.storage.mode !== 'store') return null;
  if (version.sensitivity === 'biometric' || !PREVIEWABLE_IMAGE_TYPES.has(version.mimeType)) return null;
  return `${BFF_PREFIX}${apiPaths.assetImage(version.id, version.version)}`;
}
