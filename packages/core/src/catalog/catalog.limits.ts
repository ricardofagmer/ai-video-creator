import { folderManifestMimeType, type AssetKind, type AssetLayout } from '@studio/shared/catalog';

const MIB = 1024 ** 2;
const GIB = 1024 ** 3;

/**
 * Upload and import ceilings per kind for bytes copied into the store (PRD 5.3 "size limits").
 * Folder kinds count the sum of their files. Above these, register by reference.
 */
export const MAX_STORED_BYTES_BY_KIND: Readonly<Record<AssetKind, number>> = {
  template: 512 * MIB,
  'ai-model': 2 * GIB,
  reference: 2 * GIB,
  prompt: 1 * MIB,
  skill: 50 * MIB,
  image: 50 * MIB,
  music: 200 * MIB,
  sfx: 50 * MIB,
  'brand-kit': 50 * MIB,
};

/** Ceiling for by-reference registrations, which are hashed in full but never copied. */
export const MAX_REFERENCE_BYTES = 64 * GIB;

/** Inline text content (prompt text, brand-kit or model-config JSON) is held in memory. */
export const MAX_INLINE_CONTENT_BYTES = 1 * MIB;

/** A skill's entry file (SKILL.md) read or written as text in the browser is held in memory. */
export const MAX_ENTRY_FILE_TEXT_BYTES = 256 * 1024;

const audioTypes = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac', 'audio/flac'];
const imageTypes = ['image/png', 'image/jpeg', 'image/webp'];
const videoTypes = ['video/mp4', 'video/quicktime', 'video/webm'];

/**
 * MIME allowlist per kind for `file` layouts (PRD 5.3). SVG is excluded everywhere because it can
 * carry script and the web renders catalog images. Folder layouts always use the C1 folder
 * manifest type and are allowed only for the kinds in `FOLDER_KINDS`.
 */
export const ALLOWED_FILE_MIME_TYPES_BY_KIND: Readonly<Record<AssetKind, readonly string[]>> = {
  template: ['application/json'],
  'ai-model': ['application/json', 'application/octet-stream', 'audio/wav', 'audio/x-wav', 'audio/mpeg'],
  reference: [...videoTypes, ...imageTypes, ...audioTypes, 'text/plain', 'text/markdown', 'application/pdf'],
  prompt: ['text/plain', 'text/markdown'],
  skill: [],
  // `text/plain` holds the URL of an image saved by link (images spec, 2026-11-23).
  image: [...imageTypes, 'text/plain'],
  music: audioTypes,
  sfx: audioTypes,
  'brand-kit': ['application/json'],
};

/** Kinds whose content may be a folder (a composition, a model directory, a skill, a screenshot set). */
export const FOLDER_KINDS: readonly AssetKind[] = ['template', 'ai-model', 'reference', 'skill', 'brand-kit'];

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
