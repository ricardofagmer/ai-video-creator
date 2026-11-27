/**
 * Leading-byte signatures of the MIME types the catalog allowlists (catalog.limits.ts), so a
 * declared type is checked against the bytes instead of trusted. Hand-written, no dependency;
 * every check reads only the first `CONTENT_HEAD_BYTES`. `application/octet-stream` has no
 * signature by definition and is accepted as declared.
 */
type SignatureCheck = (head: Buffer) => boolean;

function ascii(text: string): number[] {
  return [...text].map((character) => character.charCodeAt(0));
}

function bytesAt(signature: readonly number[], offset = 0): SignatureCheck {
  return (head) => head.length >= offset + signature.length && signature.every((byte, index) => head[offset + index] === byte);
}

function anyOf(...checks: SignatureCheck[]): SignatureCheck {
  return (head) => checks.some((check) => check(head));
}

function byteAt(head: Buffer, index: number): number {
  return head[index] ?? -1;
}

const id3Tag = bytesAt(ascii('ID3'));
/** ISO base media (mp4, m4a, mov from current devices): a `ftyp` box first. */
const isoBaseMedia = bytesAt(ascii('ftyp'), 4);
/** Older QuickTime files start with another top-level atom. */
const quickTime = anyOf(isoBaseMedia, ...['moov', 'mdat', 'wide', 'free', 'skip', 'pnot'].map((atom) => bytesAt(ascii(atom), 4)));
const riffForm = (form: string): SignatureCheck => (head) => bytesAt(ascii('RIFF'))(head) && bytesAt(ascii(form), 8)(head);
/** MPEG audio frame sync with a layer set (layer bits 00 are ADTS, below). */
const mpegAudioFrame: SignatureCheck = (head) => byteAt(head, 0) === 0xff && (byteAt(head, 1) & 0xe0) === 0xe0 && (byteAt(head, 1) & 0x06) !== 0;
const adtsFrame: SignatureCheck = (head) => byteAt(head, 0) === 0xff && (byteAt(head, 1) & 0xf6) === 0xf0;
/** PDF readers accept the header anywhere in the first 1024 bytes. */
const pdfHeader: SignatureCheck = (head) => head.subarray(0, 1024).includes('%PDF-', 0, 'latin1');
const utf16ByteOrderMark = anyOf(bytesAt([0xff, 0xfe]), bytesAt([0xfe, 0xff]));
/** Text: no NUL byte, unless it is UTF-16 with a byte order mark. */
const textContent: SignatureCheck = (head) => utf16ByteOrderMark(head) || !head.includes(0);

const SIGNATURES_BY_MIME_TYPE: ReadonlyMap<string, SignatureCheck> = new Map(Object.entries({
  'video/mp4': isoBaseMedia,
  'video/quicktime': quickTime,
  'video/webm': bytesAt([0x1a, 0x45, 0xdf, 0xa3]),
  'audio/mp4': isoBaseMedia,
  'audio/mpeg': anyOf(id3Tag, mpegAudioFrame),
  'audio/aac': anyOf(adtsFrame, bytesAt(ascii('ADIF')), id3Tag),
  'audio/flac': anyOf(bytesAt(ascii('fLaC')), id3Tag),
  'audio/wav': riffForm('WAVE'),
  'audio/x-wav': riffForm('WAVE'),
  'image/png': bytesAt([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/jpeg': bytesAt([0xff, 0xd8, 0xff]),
  'image/webp': riffForm('WEBP'),
  'image/gif': anyOf(bytesAt(ascii('GIF87a')), bytesAt(ascii('GIF89a'))),
  'application/pdf': pdfHeader,
  'application/json': textContent,
  'text/plain': textContent,
  'text/markdown': textContent,
}));

/** Types accepted without a signature: arbitrary bytes by definition. */
export const UNSIGNED_MIME_TYPES: readonly string[] = ['application/octet-stream'];

/** A type without a signature (octet-stream, or one not listed) is not refused here. */
export function contentMatchesMimeType(mimeType: string, head: Buffer): boolean {
  const check = SIGNATURES_BY_MIME_TYPE.get(mimeType);
  return check === undefined ? true : check(head);
}

const MIME_TYPE_BY_EXTENSION: ReadonlyMap<string, string> = new Map(Object.entries({
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  m4a: 'audio/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  aac: 'audio/aac',
  flac: 'audio/flac',
  json: 'application/json',
  txt: 'text/plain',
  md: 'text/markdown',
  html: 'text/plain',
  htm: 'text/plain',
  css: 'text/plain',
  js: 'text/plain',
  mjs: 'text/plain',
  svg: 'text/plain',
}));

/**
 * The type a folder entry claims by its extension, or null for an extension with no signature
 * here (fonts, model weights): those files are copied unchecked, as before.
 */
export function folderEntryMimeType(relativePath: string): string | null {
  const name = relativePath.slice(relativePath.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return null;
  return MIME_TYPE_BY_EXTENSION.get(name.slice(dot + 1).toLowerCase()) ?? null;
}
