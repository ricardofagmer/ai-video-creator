import { extname } from 'node:path';

/**
 * File extensions the CLI can name a MIME type for, limited to types some kind accepts in the core
 * allowlist (`ALLOWED_FILE_MIME_TYPES_BY_KIND`). The core still checks the type per kind; this map
 * only spares the owner a `--mime` for common files.
 */
const MIME_TYPES_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.pdf': 'application/pdf',
};

export function mimeTypeForPath(path: string): string | null {
  return MIME_TYPES_BY_EXTENSION[extname(path).toLowerCase()] ?? null;
}
