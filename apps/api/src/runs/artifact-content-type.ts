import { extname } from 'node:path';

/** How an artifact is sent: its Content-Type and whether a browser may show it in place. */
export interface ArtifactContentType {
  contentType: string;
  disposition: 'inline' | 'attachment';
}

/**
 * Types served inline. Anything else (including html and svg, which could run script) is sent as
 * an `application/octet-stream` attachment; the global CSP sandbox and nosniff headers back it up.
 */
const inlineTypes: Readonly<Record<string, string>> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
  '.jsonl': 'application/x-ndjson; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.vtt': 'text/vtt; charset=utf-8',
};

const OCTET_STREAM: ArtifactContentType = { contentType: 'application/octet-stream', disposition: 'attachment' };

/** The served type of an artifact, from its file name only; the content is never sniffed. */
export function artifactContentTypeOf(fileName: string): ArtifactContentType {
  const inlineType = inlineTypes[extname(fileName).toLowerCase()];
  return inlineType === undefined ? OCTET_STREAM : { contentType: inlineType, disposition: 'inline' };
}

/**
 * JSON and text artifacts (SPEC 0002 rev 4, section 13.5), served whatever the run's
 * `artifactAccess`. Everything else, media and octet-stream alike, is treated as media.
 */
export function isDocumentContentType(contentType: string): boolean {
  return contentType.startsWith('text/') || contentType.startsWith('application/json') || contentType.startsWith('application/x-ndjson');
}
