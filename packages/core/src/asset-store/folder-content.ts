import { FolderManifestSchema, serializeFolderManifest, type FolderEntry, type FolderManifest } from '@studio/shared/catalog';
import { UnsupportedFolderError } from './asset-store.errors';
import { sha256Hex, type HashedContent } from './hashing';

/**
 * A folder asset (ADR 0003 decision 1): `contentHash` is the sha-256 of the canonical C1 manifest
 * text; `sizeBytes` is the sum of the file sizes (the bytes the folder occupies).
 */
export interface FolderContent extends HashedContent {
  manifest: FolderManifest;
  /** The exact canonical text whose sha-256 is `contentHash`. */
  manifestText: string;
}

export function folderContentFrom(entries: readonly FolderEntry[], totalBytes: number): FolderContent {
  const manifestText = serializeFolderManifest(entries);
  const parsed = FolderManifestSchema.safeParse(JSON.parse(manifestText));
  if (!parsed.success) throw new UnsupportedFolderError('invalid-name', null);
  return { contentHash: sha256Hex(manifestText), sizeBytes: totalBytes, manifest: parsed.data, manifestText };
}
