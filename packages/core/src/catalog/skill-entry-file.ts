import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { Injectable } from '@nestjs/common';
import { folderManifestMimeType, formatAssetRef, type AssetRef, type AssetVersion, type FolderEntry } from '@studio/shared/catalog';
import { ContentStore } from '../asset-store/content-store';
import { folderContentFrom } from '../asset-store/folder-content';
import { isErrnoException } from '../asset-store/fs-errors';
import { FolderReader, type FolderFileSource } from '../asset-store/folder-reader';
import { sha256Hex } from '../asset-store/hashing';
import { folderHeadInspector, type PreparedContent } from './asset-content';
import { EntryFileUnavailableError } from './catalog.errors';
import { MAX_ENTRY_FILE_TEXT_BYTES, MAX_STORED_BYTES_BY_KIND, MAX_REFERENCE_BYTES } from './catalog.limits';

/** The path reported for a single-file prompt's text. */
const PROMPT_TEXT_PATH = 'prompt.md';

/** The entry file of a skill version (or the text of a stored prompt), as text. */
export interface EntryFileText {
  /** C1 `RelativePath` inside the skill folder. */
  path: string;
  text: string;
}

function refOf(version: AssetVersion): AssetRef {
  return formatAssetRef({ assetId: version.id, version: version.version });
}

/** Skills only, folder layout only; returns the entry file's relative path. */
function entryPathOf(version: AssetVersion): string {
  if (version.kind !== 'skill') throw new EntryFileUnavailableError(refOf(version), 'not-a-skill');
  if (version.layout !== 'folder') throw new EntryFileUnavailableError(refOf(version), 'not-a-folder');
  return version.details.entryFile;
}

/**
 * Reads and replaces a skill's entry file (SKILL.md) as UTF-8 text (skills spec addendum T5).
 * Reads open the file without following a link, cap it, verify its sha-256 against the folder
 * manifest and decode with a fatal UTF-8 decoder. A replacement keeps every other file by hash
 * and writes a new canonical manifest; nothing already stored is changed.
 */
@Injectable()
export class SkillEntryFileService {
  constructor(
    private readonly store: ContentStore,
    private readonly folders: FolderReader,
  ) {}

  async readText(version: AssetVersion, signal?: AbortSignal): Promise<EntryFileText> {
    if (version.kind === 'prompt') return this.readPromptText(version, signal);
    const path = entryPathOf(version);
    const files = await this.listFiles(version, signal);
    const entry = files.find((file) => file.relativePath === path);
    if (entry === undefined) throw new EntryFileUnavailableError(refOf(version), 'missing');
    if (entry.sizeBytes > MAX_ENTRY_FILE_TEXT_BYTES) throw new EntryFileUnavailableError(refOf(version), 'too-large');
    const bytes = await this.readBounded(version, entry, signal);
    return { path, text: decodeUtf8(version, bytes) };
  }

  /**
   * A saved prompt's text, so the web can fill a run's instructions from it (images and prompts
   * spec, 2026-11-23). Stored single files only; the blob is held to the version's hash.
   */
  private async readPromptText(version: AssetVersion, signal: AbortSignal | undefined): Promise<EntryFileText> {
    if (version.layout !== 'file') throw new EntryFileUnavailableError(refOf(version), 'not-a-folder');
    if (version.storage.mode !== 'store') throw new EntryFileUnavailableError(refOf(version), 'referenced-folder');
    const entry: FolderFileSource = {
      relativePath: PROMPT_TEXT_PATH,
      sizeBytes: version.sizeBytes,
      contentHash: version.contentHash,
      absolutePath: this.store.blobPath(version.contentHash),
    };
    if (entry.sizeBytes > MAX_ENTRY_FILE_TEXT_BYTES) throw new EntryFileUnavailableError(refOf(version), 'too-large');
    const bytes = await this.readBounded(version, entry, signal);
    return { path: PROMPT_TEXT_PATH, text: decodeUtf8(version, bytes) };
  }

  /** Content for N+1: the stored folder of `previous` with its entry file replaced (or added). */
  async replaceText(previous: AssetVersion, text: string, signal?: AbortSignal): Promise<PreparedContent> {
    const path = entryPathOf(previous);
    if (previous.storage.mode !== 'store') throw new EntryFileUnavailableError(refOf(previous), 'referenced-folder');
    const bytes = Buffer.from(text, 'utf8');
    if (bytes.byteLength > MAX_ENTRY_FILE_TEXT_BYTES) throw new EntryFileUnavailableError(refOf(previous), 'too-large');

    const kept = (await this.listFiles(previous, signal)).filter((file) => file.relativePath !== path);
    const keptBytes = kept.reduce((sum, file) => sum + file.sizeBytes, 0);
    const maxStored = MAX_STORED_BYTES_BY_KIND.skill;
    if (keptBytes + bytes.byteLength > maxStored) throw new EntryFileUnavailableError(refOf(previous), 'folder-too-large');

    const inspect = folderHeadInspector('skill');
    const written = await this.store.putBytes(bytes, {
      maxBytes: MAX_ENTRY_FILE_TEXT_BYTES,
      signal,
      inspectHead: (head) => inspect(path, head),
    });
    const entries: FolderEntry[] = [
      ...kept.map((file) => ({ path: file.relativePath, sizeBytes: file.sizeBytes, contentHash: file.contentHash })),
      { path, sizeBytes: written.sizeBytes, contentHash: written.contentHash },
    ];
    const folder = folderContentFrom(entries, keptBytes + written.sizeBytes);
    // sha-256 of the same text, so this blob lands at `blobPath(folder.contentHash)`.
    await this.store.putBytes(Buffer.from(folder.manifestText, 'utf8'), {
      maxBytes: Buffer.byteLength(folder.manifestText, 'utf8'),
      signal,
    });
    return {
      contentHash: folder.contentHash,
      sizeBytes: folder.sizeBytes,
      mimeType: folderManifestMimeType,
      layout: 'folder',
      storage: { mode: 'store' },
    };
  }

  private async listFiles(version: AssetVersion, signal: AbortSignal | undefined): Promise<FolderFileSource[]> {
    const storage = version.storage;
    return this.folders.listFiles(
      storage.mode === 'store'
        ? { storage: 'store', contentHash: version.contentHash, absolutePath: this.store.blobPath(version.contentHash) }
        : { storage: 'reference', contentHash: version.contentHash, absolutePath: storage.absolutePath },
      { maxBytes: MAX_REFERENCE_BYTES, signal },
    );
  }

  private async readBounded(version: AssetVersion, entry: FolderFileSource, signal: AbortSignal | undefined): Promise<Buffer> {
    const handle = await open(entry.absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW).catch((error: unknown) => {
      // A vanished file or a link in its place is reported as missing, without its path.
      if (isErrnoException(error) && (error.code === 'ENOENT' || error.code === 'ELOOP')) {
        throw new EntryFileUnavailableError(refOf(version), 'missing');
      }
      throw error;
    });
    try {
      const stats = await handle.stat();
      if (!stats.isFile()) throw new EntryFileUnavailableError(refOf(version), 'missing');
      if (stats.size > MAX_ENTRY_FILE_TEXT_BYTES) throw new EntryFileUnavailableError(refOf(version), 'too-large');
      const bytes = await handle.readFile({ signal });
      // The listing named the hash these bytes must have; a changed file is not served.
      if (sha256Hex(bytes) !== entry.contentHash) throw new EntryFileUnavailableError(refOf(version), 'missing');
      return bytes;
    } finally {
      await handle.close();
    }
  }
}

function decodeUtf8(version: AssetVersion, bytes: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // Binary or mis-encoded bytes are refused rather than shown garbled.
    throw new EntryFileUnavailableError(refOf(version), 'not-text');
  }
}
