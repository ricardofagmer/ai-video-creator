import {
  ALLOWED_FILE_MIME_TYPES_BY_KIND,
  FOLDER_KINDS,
  folderManifestMimeType,
  type AssetKind,
  type AssetLayout,
} from '@studio/shared/catalog';

// The limits live in `@studio/shared/catalog` so the web reads the same values; core callers keep this path.
export {
  ALLOWED_FILE_MIME_TYPES_BY_KIND,
  FOLDER_KINDS,
  MAX_ENTRY_FILE_TEXT_BYTES,
  MAX_INLINE_CONTENT_BYTES,
  MAX_REFERENCE_BYTES,
  MAX_STORED_BYTES_BY_KIND,
} from '@studio/shared/catalog';

/**
 * Kinds whose content is third-party by nature (PRD 5.1: "audio track or effect with license"):
 * like `sensitivity: third-party`, they need license and provenance before `active`.
 */
export const KINDS_REQUIRING_LICENSE: readonly AssetKind[] = ['music', 'sfx'];

export function isLayoutAllowed(kind: AssetKind, layout: AssetLayout): boolean {
  return layout === 'file' ? kind !== 'skill' : FOLDER_KINDS.includes(kind);
}

export function isMimeTypeAllowed(kind: AssetKind, layout: AssetLayout, mimeType: string): boolean {
  if (layout === 'folder') return mimeType === folderManifestMimeType;
  return ALLOWED_FILE_MIME_TYPES_BY_KIND[kind].includes(mimeType);
}
