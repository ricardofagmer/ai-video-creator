import { createHash } from 'node:crypto';
import { open, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { FolderManifestSchema, type AssetVersion, type Sha256 } from '@studio/shared/catalog';
import { AssetStoreError, MAX_FOLDER_MANIFEST_BYTES, isInsideOrEqual, type ContentStore, type FolderContent, type ReferenceInspector } from '../../asset-store';
import { type RedactorService } from '../../redaction';
import { biometricPathState } from './biometric-guard';

/** Read cap of one text body; also the redactor's per-string limit, so a bigger body could not be redacted. */
export const MAX_ASSET_TEXT_BYTES = 1_000_000;

const READ_CHUNK_BYTES = 64 * 1024;

/**
 * Text body of a text kind (topology 3.2: prompt, skill, brand kit, reference notes). Media
 * kinds have none; their bytes are never read. `truncated` means the body is longer than the
 * read cap and only its start was read; the tool says so in `_pagination`. `missing` also covers
 * bytes that no longer match the version's pinned hash: they are not the version the owner chose.
 */
export type AssetTextRead =
  | { readonly status: 'text'; readonly text: string; readonly truncated: boolean }
  | { readonly status: 'no-text' }
  | { readonly status: 'missing' }
  | { readonly status: 'biometric' };

/** The hash and size a file must still have; more bytes than `maxBytes` already means it changed. */
interface ContentPin {
  readonly contentHash: Sha256;
  readonly maxBytes: number;
}

type SkillVersion = Extract<AssetVersion, { kind: 'skill' }>;

type PinnedRead = { readonly status: 'read'; readonly text: string; readonly truncated: boolean } | { readonly status: 'changed' };

export interface AssetTextReaderDependencies {
  readonly store: ContentStore;
  readonly references: ReferenceInspector;
  readonly redactor: RedactorService;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'EISDIR');
}

/**
 * Streams the whole file through sha-256 (bounded by the pin's size) while keeping only its first
 * `textMaxBytes`, so the text handed on is from the very bytes that matched the pin.
 */
async function readPinned(path: string, request: { pin: ContentPin; textMaxBytes: number; signal: AbortSignal }): Promise<PinnedRead> {
  const handle = await open(path, 'r');
  try {
    const hash = createHash('sha256');
    const window = Buffer.alloc(request.textMaxBytes + 1);
    const chunk = Buffer.alloc(READ_CHUNK_BYTES);
    let windowFilled = 0;
    let total = 0;
    for (;;) {
      request.signal.throwIfAborted();
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, total);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > request.pin.maxBytes) return { status: 'changed' };
      const read = chunk.subarray(0, bytesRead);
      hash.update(read);
      if (windowFilled < window.length) windowFilled += read.copy(window, windowFilled);
    }
    if (hash.digest('hex') !== request.pin.contentHash) return { status: 'changed' };
    const truncated = windowFilled > request.textMaxBytes;
    return { status: 'read', text: window.subarray(0, Math.min(windowFilled, request.textMaxBytes)).toString('utf8'), truncated };
  } finally {
    await handle.close();
  }
}

/**
 * Reads the text of a catalog version for AssetDescribeTool. Paths come from the catalog row
 * (owner-registered), never from the model. Every path is checked against the registered
 * biometric references, after following symlinks, before it is opened; a check that cannot run
 * refuses the read. A folder entry must stay inside its folder. Every byte handed on is checked
 * against the version's pinned hash (the file's, a stored manifest entry's, or the reference
 * folder's re-hashed manifest), so the memo never keeps text the owner did not version (M3).
 */
export class AssetTextReader {
  constructor(private readonly dependencies: AssetTextReaderDependencies) {}

  async read(version: AssetVersion, signal: AbortSignal): Promise<AssetTextRead> {
    if (version.sensitivity === 'biometric') return { status: 'biometric' };
    switch (version.kind) {
      case 'reference':
        return { status: 'text', text: version.details.referenceNotes, truncated: false };
      case 'brand-kit':
        // The brand kit's curated fields are its text: palette, fonts, tone of voice, motion style.
        return { status: 'text', text: JSON.stringify(version.details, null, 2), truncated: false };
      case 'prompt':
        return this.readFileText(this.filePathOf(version), { pin: { contentHash: version.contentHash, maxBytes: version.sizeBytes }, signal });
      case 'skill':
        return version.storage.mode === 'reference'
          ? this.readReferencedSkillEntry(version, version.storage.absolutePath, signal)
          : this.readStoredSkillEntry(version, signal);
      case 'template':
      case 'ai-model':
      case 'image':
      case 'music':
      case 'sfx':
        return { status: 'no-text' };
    }
  }

  private filePathOf(version: AssetVersion): string {
    return version.storage.mode === 'reference' ? version.storage.absolutePath : this.dependencies.store.blobPath(version.contentHash);
  }

  /**
   * A reference folder pins only its canonical manifest hash, so the folder is re-hashed (bounded
   * by the registered size) and the entry is then read against its own hash from that manifest.
   */
  private async readReferencedSkillEntry(version: SkillVersion, root: string, signal: AbortSignal): Promise<AssetTextRead> {
    if ((await biometricPathState(this.dependencies.redactor, root)) !== 'clear') return { status: 'biometric' };
    let folder: FolderContent;
    let realRoot: string;
    let realEntry: string;
    try {
      folder = await this.dependencies.references.inspectFolder(root, { maxBytes: version.sizeBytes, signal });
      realRoot = await realpath(root);
      realEntry = await realpath(join(root, version.details.entryFile));
    } catch (error) {
      // A folder that grew, gained a symlink or lost files is not the registered version.
      if (error instanceof AssetStoreError || isMissing(error)) return { status: 'missing' };
      throw error;
    }
    if (folder.contentHash !== version.contentHash) return { status: 'missing' };
    const entry = folder.manifest.files.find((file) => file.path === version.details.entryFile);
    if (entry === undefined) return { status: 'missing' };
    if (!isInsideOrEqual(realRoot, realEntry) || realEntry === realRoot) return { status: 'missing' };
    return this.readFileText(realEntry, { pin: { contentHash: entry.contentHash, maxBytes: entry.sizeBytes }, signal });
  }

  private async readStoredSkillEntry(version: SkillVersion, signal: AbortSignal): Promise<AssetTextRead> {
    const store = this.dependencies.store;
    const manifestText = await this.readFileText(store.blobPath(version.contentHash), {
      pin: { contentHash: version.contentHash, maxBytes: MAX_FOLDER_MANIFEST_BYTES },
      signal,
      textMaxBytes: MAX_FOLDER_MANIFEST_BYTES,
    });
    if (manifestText.status !== 'text' || manifestText.truncated) return manifestText.status === 'biometric' ? manifestText : { status: 'missing' };
    let manifestJson: unknown;
    try {
      manifestJson = JSON.parse(manifestText.text);
    } catch {
      // A corrupt manifest blob is reported like a missing file: the version cannot be read.
      return { status: 'missing' };
    }
    const manifest = FolderManifestSchema.safeParse(manifestJson);
    if (!manifest.success) return { status: 'missing' };
    const entry = manifest.data.files.find((file) => file.path === version.details.entryFile);
    if (entry === undefined) return { status: 'missing' };
    return this.readFileText(store.blobPath(entry.contentHash), { pin: { contentHash: entry.contentHash, maxBytes: entry.sizeBytes }, signal });
  }

  private async readFileText(
    path: string,
    request: { pin: ContentPin; signal: AbortSignal; textMaxBytes?: number },
  ): Promise<AssetTextRead> {
    request.signal.throwIfAborted();
    let realPath: string;
    try {
      realPath = await realpath(path);
    } catch (error) {
      if (isMissing(error)) return { status: 'missing' };
      throw error;
    }
    for (const candidate of new Set([path, realPath])) {
      if ((await biometricPathState(this.dependencies.redactor, candidate)) !== 'clear') return { status: 'biometric' };
    }
    let read: PinnedRead;
    try {
      read = await readPinned(realPath, { pin: request.pin, textMaxBytes: request.textMaxBytes ?? MAX_ASSET_TEXT_BYTES, signal: request.signal });
    } catch (error) {
      if (isMissing(error)) return { status: 'missing' };
      throw error;
    }
    return read.status === 'read' ? { status: 'text', text: read.text, truncated: read.truncated } : { status: 'missing' };
  }
}
