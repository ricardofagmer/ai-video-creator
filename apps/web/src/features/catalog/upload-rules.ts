import { formatBytes, type Locale } from '@studio/ui';
import {
  ALLOWED_FILE_MIME_TYPES_BY_KIND,
  FOLDER_KINDS,
  IMAGE_FILE_MIME_TYPES,
  MAX_STORED_BYTES_BY_KIND,
  RelativePathSchema,
  type AssetKind,
} from '@studio/shared/catalog';
import { type WebMessages } from '@/messages';

/**
 * The R1-05 upload rules on the web side, read from the same constants the core applies, so the
 * owner hears about a wrong type or size before sending gigabytes. The api stays authoritative (PRD 5.3).
 */
export const maxUploadBytesByKind: Readonly<Record<AssetKind, number>> = MAX_STORED_BYTES_BY_KIND;

export const allowedMimeTypesByKind: Readonly<Record<AssetKind, readonly string[]>> = {
  ...ALLOWED_FILE_MIME_TYPES_BY_KIND,
  // The upload picker stays image-only; a `text/plain` image is made only by the link box.
  image: IMAGE_FILE_MIME_TYPES,
};

export function allowsFolder(kind: AssetKind): boolean {
  return FOLDER_KINDS.includes(kind);
}

export function allowsSingleFile(kind: AssetKind): boolean {
  return kind !== 'skill';
}

/** "MP3, WAV ou M4A, até 200 MB" for the dropzone hint, in the active locale. */
export function uploadHint(kind: AssetKind, t: WebMessages['catalog'], locale: Locale): string {
  return t.uploadHint(t.uploadHintTypes[kind], formatBytes(maxUploadBytesByKind[kind], locale));
}

export function acceptAttribute(kind: AssetKind): string | undefined {
  const types = allowedMimeTypesByKind[kind];
  return types.length === 0 ? undefined : types.join(',');
}

/** Browsers leave `File.type` empty for some text files; the extension decides then. */
const typesByExtension: Readonly<Record<string, string>> = {
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
  json: 'application/json',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
  webp: 'image/webp',
};

export function mimeTypeOf(file: File): string {
  if (file.type !== '') return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return typesByExtension[extension] ?? 'application/octet-stream';
}

/** A copy of the file whose part Content-Type is the resolved MIME type (C10: part type = version type). */
export function withResolvedType(file: File): File {
  const type = mimeTypeOf(file);
  return type === file.type ? file : new File([file], file.name, { type, lastModified: file.lastModified });
}

/** A folder file's relative path as C10 accepts it, or null when a segment has other characters. */
export function folderRelativePath(file: File): string | null {
  const path = file.webkitRelativePath === '' ? file.name : file.webkitRelativePath;
  return RelativePathSchema.safeParse(path).success ? path : null;
}

export type FileProblem = { type: 'mime'; fileName: string } | { type: 'size' } | { type: 'name'; fileName: string } | { type: 'missing' };

/** The first problem of a selection for `kind` and layout, or null when the web sees none. */
export function selectionProblem(kind: AssetKind, layout: 'file' | 'folder', files: readonly File[]): FileProblem | null {
  if (files.length === 0) return { type: 'missing' };
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > maxUploadBytesByKind[kind]) return { type: 'size' };
  if (layout === 'folder') {
    const unnamed = files.find((file) => folderRelativePath(file) === null);
    return unnamed === undefined ? null : { type: 'name', fileName: unnamed.name };
  }
  const [file] = files;
  if (file !== undefined && !allowedMimeTypesByKind[kind].includes(mimeTypeOf(file))) return { type: 'mime', fileName: file.name };
  return null;
}
