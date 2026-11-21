import { type Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import {
  MimeTypeSchema,
  folderManifestMimeType,
  type AssetKind,
  type AssetLayout,
  type AssetStorage,
  type Sensitivity,
  type Sha256,
} from '@studio/shared/catalog';
import { type HeadInspector } from '../asset-store/content-head';
import { ContentStore, type PutFolderOptions } from '../asset-store/content-store';
import { ReferenceInspector } from '../asset-store/reference-inspector';
import { BiometricSourceGuard } from './biometric-source.guard';
import {
  BiometricRequiresReferenceError,
  ContentTypeMismatchError,
  InvalidAssetInputError,
  LayoutNotAllowedError,
  MimeTypeNotAllowedError,
} from './catalog.errors';
import {
  MAX_INLINE_CONTENT_BYTES,
  MAX_REFERENCE_BYTES,
  MAX_STORED_BYTES_BY_KIND,
  isLayoutAllowed,
  isMimeTypeAllowed,
} from './catalog.limits';
import { contentMatchesMimeType, folderEntryMimeType } from './content-signature';

/**
 * Where a version's bytes come from (PRD 5.3). `upload`, `inline`, `import-*` copy into the
 * store; `reference-*` hash in place and copy nothing; `previous-version` reuses the bytes of an
 * existing version of the same asset (a metadata-only edit still creates N+1).
 */
export type AssetContentInput =
  | { source: 'upload'; stream: Readable; mimeType: string }
  | { source: 'inline'; text: string; mimeType: string }
  | { source: 'import-file'; absolutePath: string; mimeType: string }
  | { source: 'import-folder'; absolutePath: string }
  | { source: 'reference-file'; absolutePath: string; mimeType: string }
  | { source: 'reference-folder'; absolutePath: string }
  | { source: 'previous-version'; version: number };

/** Content for a brand-new asset: there is no earlier version to reuse. */
export type NewAssetContentInput = Exclude<AssetContentInput, { source: 'previous-version' }>;

/** Storage facts of a version, as C1 records them. */
export interface PreparedContent {
  contentHash: Sha256;
  sizeBytes: number;
  mimeType: string;
  layout: AssetLayout;
  storage: AssetStorage;
}

export interface PrepareContentRequest {
  kind: AssetKind;
  sensitivity: Sensitivity;
  content: NewAssetContentInput;
  signal?: AbortSignal;
}

function layoutOf(content: NewAssetContentInput): AssetLayout {
  return content.source === 'import-folder' || content.source === 'reference-folder' ? 'folder' : 'file';
}

function mimeTypeOf(content: NewAssetContentInput): string {
  return content.source === 'import-folder' || content.source === 'reference-folder' ? folderManifestMimeType : content.mimeType;
}

/** Criterion 22, checked before any byte is read or written. */
export function assertBiometricStorage(sensitivity: Sensitivity, storageMode: AssetStorage['mode']): void {
  if (sensitivity === 'biometric' && storageMode !== 'reference') throw new BiometricRequiresReferenceError();
}

/** Declared MIME type against the leading bytes of a single file (upload, inline, import-file). */
function fileHeadInspector(kind: AssetKind, mimeType: string): HeadInspector {
  return (head) => {
    if (!contentMatchesMimeType(mimeType, head)) throw new ContentTypeMismatchError(kind, mimeType, null);
  };
}

/** Inside an imported folder each file is held to the type its extension claims. */
function folderHeadInspector(kind: AssetKind): NonNullable<PutFolderOptions['inspectFileHead']> {
  return (relativePath, head) => {
    const mimeType = folderEntryMimeType(relativePath);
    if (mimeType !== null && !contentMatchesMimeType(mimeType, head)) throw new ContentTypeMismatchError(kind, mimeType, relativePath);
  };
}

/**
 * Boundary validation and byte handling for new content: layout and MIME allowlist per kind,
 * size limit per kind, biometric-by-reference, biometric containment by location, then a store
 * write (with a magic-byte check of the declared type) or a read-only inspection.
 */
@Injectable()
export class AssetContentService {
  constructor(
    private readonly store: ContentStore,
    private readonly references: ReferenceInspector,
    private readonly biometricSources: BiometricSourceGuard,
  ) {}

  async prepare(request: PrepareContentRequest): Promise<PreparedContent> {
    const { kind, sensitivity, content, signal } = request;
    const layout = layoutOf(content);
    const mimeType = mimeTypeOf(content);
    if (!isLayoutAllowed(kind, layout)) throw new LayoutNotAllowedError(kind, layout);
    if (!MimeTypeSchema.safeParse(mimeType).success) throw new MimeTypeNotAllowedError(kind, '<malformed>');
    if (!isMimeTypeAllowed(kind, layout, mimeType)) throw new MimeTypeNotAllowedError(kind, mimeType);
    const isReference = content.source === 'reference-file' || content.source === 'reference-folder';
    assertBiometricStorage(sensitivity, isReference ? 'reference' : 'store');
    // The label is the caller's word; the location is checked too. Only a biometric-labelled
    // reference may point at biometric material.
    if (content.source !== 'upload' && content.source !== 'inline' && sensitivity !== 'biometric') {
      await this.biometricSources.assertNotBiometricSource(content.absolutePath);
    }

    const maxStored = MAX_STORED_BYTES_BY_KIND[kind];
    switch (content.source) {
      case 'upload': {
        const hashed = await this.store.putStream(content.stream, { maxBytes: maxStored, signal, inspectHead: fileHeadInspector(kind, mimeType) });
        return { ...hashed, mimeType, layout, storage: { mode: 'store' } };
      }
      case 'inline': {
        const bytes = Buffer.from(content.text, 'utf8');
        const hashed = await this.store.putBytes(bytes, {
          maxBytes: Math.min(maxStored, MAX_INLINE_CONTENT_BYTES),
          signal,
          inspectHead: fileHeadInspector(kind, mimeType),
        });
        return { ...hashed, mimeType, layout, storage: { mode: 'store' } };
      }
      case 'import-file': {
        const hashed = await this.store.putFile(content.absolutePath, { maxBytes: maxStored, signal, inspectHead: fileHeadInspector(kind, mimeType) });
        return { ...hashed, mimeType, layout, storage: { mode: 'store' } };
      }
      case 'import-folder': {
        const folder = await this.store.putFolder(content.absolutePath, {
          maxTotalBytes: maxStored,
          signal,
          inspectFileHead: folderHeadInspector(kind),
        });
        return { contentHash: folder.contentHash, sizeBytes: folder.sizeBytes, mimeType, layout, storage: { mode: 'store' } };
      }
      case 'reference-file': {
        const hashed = await this.references.inspectFile(content.absolutePath, { maxBytes: MAX_REFERENCE_BYTES, signal });
        return { ...hashed, mimeType, layout, storage: { mode: 'reference', absolutePath: content.absolutePath } };
      }
      case 'reference-folder': {
        const folder = await this.references.inspectFolder(content.absolutePath, { maxBytes: MAX_REFERENCE_BYTES, signal });
        return {
          contentHash: folder.contentHash,
          sizeBytes: folder.sizeBytes,
          mimeType,
          layout,
          storage: { mode: 'reference', absolutePath: content.absolutePath },
        };
      }
    }
    // Reached only by an untyped caller passing a source outside NewAssetContentInput.
    throw new InvalidAssetInputError([{ path: 'content.source', message: 'unsupported content source' }]);
  }
}
