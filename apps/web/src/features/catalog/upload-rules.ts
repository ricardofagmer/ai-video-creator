import { formatBytes, type Locale } from '@studio/ui';
import { RelativePathSchema, type AssetKind } from '@studio/shared/catalog';
import { type WebMessages } from '@/messages';

/**
 * Web-side mirror of the R1-05 upload rules (`packages/core/src/catalog/catalog.limits.ts`), so the
 * owner hears about a wrong type or size before sending gigabytes. The api applies the same rules
 * and stays authoritative (PRD 5.3); the web cannot import `@studio/core` (a Nest backend module).
 */
const MIB = 1024 ** 2;
const GIB = 1024 ** 3;

export const maxUploadBytesByKind: Readonly<Record<AssetKind, number>> = {
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

const audioTypes = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac', 'audio/flac'];
const imageTypes = ['image/png', 'image/jpeg', 'image/webp'];
const videoTypes = ['video/mp4', 'video/quicktime', 'video/webm'];

export const allowedMimeTypesByKind: Readonly<Record<AssetKind, readonly string[]>> = {
  template: ['application/json'],
  'ai-model': ['application/json', 'application/octet-stream', 'audio/wav', 'audio/x-wav', 'audio/mpeg'],
  reference: [...videoTypes, ...imageTypes, ...audioTypes, 'text/plain', 'text/markdown', 'application/pdf'],
  prompt: ['text/plain', 'text/markdown'],
  skill: [],
  // The upload picker stays image-only; a `text/plain` image is made only by the link box.
  image: imageTypes,
  music: audioTypes,
  sfx: audioTypes,
  'brand-kit': ['application/json'],
};

/** Kinds whose content may be a folder; a skill must be one. */
const folderKinds: readonly AssetKind[] = ['template', 'ai-model', 'reference', 'skill', 'brand-kit'];

export function allowsFolder(kind: AssetKind): boolean {
  return folderKinds.includes(kind);
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
