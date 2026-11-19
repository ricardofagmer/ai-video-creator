import { open, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { FolderManifestSchema, type AssetVersion } from '@studio/shared/catalog';
import { MAX_FOLDER_MANIFEST_BYTES, isInsideOrEqual, type ContentStore } from '../../asset-store';
import { type RedactorService } from '../../redaction';
import { biometricPathState } from './biometric-guard';

/** Read cap of one text body; also the redactor's per-string limit, so a bigger body could not be redacted. */
export const MAX_ASSET_TEXT_BYTES = 1_000_000;

/**
 * Text body of a text kind (topology 3.2: prompt, skill, brand kit, reference notes). Media
 * kinds have none; their bytes are never read. `truncated` means the body is longer than the
 * read cap and only its start was read; the tool says so in `_pagination`.
 */
export type AssetTextRead =
  | { readonly status: 'text'; readonly text: string; readonly truncated: boolean }
  | { readonly status: 'no-text' }
  | { readonly status: 'missing' }
  | { readonly status: 'biometric' };

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}

async function readBounded(path: string, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(maxBytes + 1);
    let filled = 0;
    while (filled < buffer.length) {
      const { bytesRead } = await handle.read(buffer, filled, buffer.length - filled, filled);
      if (bytesRead === 0) break;
      filled += bytesRead;
    }
    const truncated = filled > maxBytes;
    return { text: buffer.subarray(0, Math.min(filled, maxBytes)).toString('utf8'), truncated };
  } finally {
    await handle.close();
  }
}

/**
 * Reads the text of a catalog version for AssetDescribeTool. Paths come from the catalog row
 * (owner-registered), never from the model. Every path is checked against the registered
 * biometric references, after following symlinks, before it is opened; a check that cannot run
 * refuses the read. A folder entry must stay inside its folder.
 */
export class AssetTextReader {
  constructor(
    private readonly store: ContentStore,
    private readonly redactor: RedactorService,
  ) {}

  async read(version: AssetVersion, signal: AbortSignal): Promise<AssetTextRead> {
    if (version.sensitivity === 'biometric') return { status: 'biometric' };
    switch (version.kind) {
      case 'reference':
        return { status: 'text', text: version.details.referenceNotes, truncated: false };
      case 'brand-kit':
        // The brand kit's curated fields are its text: palette, fonts, tone of voice, motion style.
        return { status: 'text', text: JSON.stringify(version.details, null, 2), truncated: false };
      case 'prompt':
        return this.readFileText(this.filePathOf(version), signal);
      case 'skill':
        return this.readSkillEntry(version, version.details.entryFile, signal);
      case 'template':
      case 'ai-model':
      case 'image':
      case 'music':
      case 'sfx':
        return { status: 'no-text' };
    }
  }

  private filePathOf(version: AssetVersion): string {
    return version.storage.mode === 'reference' ? version.storage.absolutePath : this.store.blobPath(version.contentHash);
  }

  private async readSkillEntry(version: AssetVersion, entryFile: string, signal: AbortSignal): Promise<AssetTextRead> {
    if (version.storage.mode === 'reference') {
      const root = version.storage.absolutePath;
      let realRoot: string;
      let realEntry: string;
      try {
        realRoot = await realpath(root);
        realEntry = await realpath(join(root, entryFile));
      } catch (error) {
        if (isMissing(error)) return { status: 'missing' };
        throw error;
      }
      if (!isInsideOrEqual(realRoot, realEntry) || realEntry === realRoot) return { status: 'missing' };
      return this.readFileText(realEntry, signal);
    }
    const manifestText = await this.readFileText(this.store.blobPath(version.contentHash), signal, MAX_FOLDER_MANIFEST_BYTES);
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
    const entry = manifest.data.files.find((file) => file.path === entryFile);
    if (entry === undefined) return { status: 'missing' };
    return this.readFileText(this.store.blobPath(entry.contentHash), signal);
  }

  private async readFileText(path: string, signal: AbortSignal, maxBytes = MAX_ASSET_TEXT_BYTES): Promise<AssetTextRead> {
    signal.throwIfAborted();
    let realPath: string;
    try {
      realPath = await realpath(path);
    } catch (error) {
      if (isMissing(error)) return { status: 'missing' };
      throw error;
    }
    for (const candidate of new Set([path, realPath])) {
      if ((await biometricPathState(this.redactor, candidate)) !== 'clear') return { status: 'biometric' };
    }
    try {
      const { text, truncated } = await readBounded(realPath, maxBytes);
      return { status: 'text', text, truncated };
    } catch (error) {
      if (isMissing(error)) return { status: 'missing' };
      throw error;
    }
  }
}
