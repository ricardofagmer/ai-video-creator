import { open, readFile, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { FolderManifestSchema, type AssetVersion, type Sha256 } from '@studio/shared/catalog';
import { curationBounds } from '@studio/shared/curation';
import { ContentStore } from '../asset-store/content-store';
import { MAX_FOLDER_MANIFEST_BYTES } from '../asset-store/content-verifier';
import { listFolderFiles } from '../asset-store/folder-walk';
import { sha256Hex } from '../asset-store/hashing';
import { isInsideOrEqual } from '../asset-store/path-guards';
import { RedactorService } from '../redaction/redactor.service';

/** A UTF-8 character is at most 4 bytes, so a body of 16,000 characters fits in this many. */
export const MAX_SUBJECT_BODY_BYTES = curationBounds.maxBodyChars * 4;

/** Why an asset's text body cannot be curated; the selector maps each to a C10 refusal. */
export type BodyRefusal = 'not-curatable' | 'body-too-large' | 'biometric' | 'body-unavailable';

export type SubjectBodyRead = { status: 'read'; body: string } | { status: 'refused'; refusal: BodyRefusal };

/** One file of a skill folder: its C1 relative path and where its bytes are read from. */
export interface SkillSourceFile {
  relativePath: string;
  absolutePath: string;
  /** The manifest hash of a stored file; null for a reference folder, whose files are not pinned per entry. */
  contentHash: Sha256 | null;
}

export type SkillSourceFiles = { status: 'listed'; files: SkillSourceFile[] } | { status: 'refused'; refusal: BodyRefusal };

const decoder = new TextDecoder('utf-8', { fatal: true });

async function readBounded(absolutePath: string): Promise<Buffer | 'too-large'> {
  const handle = await open(absolutePath, 'r');
  try {
    const buffer = Buffer.alloc(MAX_SUBJECT_BODY_BYTES + 1);
    let filled = 0;
    while (filled < buffer.length) {
      const { bytesRead } = await handle.read(buffer, filled, buffer.length - filled, filled);
      if (bytesRead === 0) break;
      filled += bytesRead;
    }
    return filled > MAX_SUBJECT_BODY_BYTES ? 'too-large' : buffer.subarray(0, filled);
  } finally {
    await handle.close();
  }
}

/** UTF-8 text without NUL, at most 16,000 characters (SPEC 0005 section 5.1 step 2). */
function decodeBody(bytes: Buffer): SubjectBodyRead {
  let body: string;
  try {
    body = decoder.decode(bytes);
  } catch {
    // Invalid UTF-8 is binary content, which the Curator never curates; the bytes are not echoed.
    return { status: 'refused', refusal: 'not-curatable' };
  }
  if (body.includes('\u0000')) return { status: 'refused', refusal: 'not-curatable' };
  if (body.length > curationBounds.maxBodyChars) return { status: 'refused', refusal: 'body-too-large' };
  return { status: 'read', body };
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'EISDIR');
}

/**
 * Reads the text body of a prompt or skill subject (SPEC 0005 sections 5.1 and 5.3), read-only: a
 * prompt is its file, a skill is its `details.entryFile` inside the folder. Stored bytes come from
 * the content store and are checked against their hash; a reference path is first checked against
 * the biometric registry through the redactor (fail closed) and the entry file must resolve inside
 * its folder after following symlinks. Nothing is read past 64,001 bytes.
 */
@Injectable()
export class CurationSubjectBodyReader {
  constructor(
    private readonly store: ContentStore,
    private readonly redactor: RedactorService,
  ) {}

  async readBody(version: AssetVersion): Promise<SubjectBodyRead> {
    if (version.kind === 'prompt' && version.layout === 'file') return this.readPromptBody(version);
    if (version.kind === 'skill' && version.layout === 'folder') {
      const listed = await this.skillFiles(version);
      if (listed.status === 'refused') return listed;
      const entry = listed.files.find((file) => file.relativePath === version.details.entryFile);
      if (entry === undefined) return { status: 'refused', refusal: 'body-unavailable' };
      return this.readFileBody(entry.absolutePath, entry.contentHash);
    }
    return { status: 'refused', refusal: 'not-curatable' };
  }

  /**
   * Every file of a skill folder, from the stored manifest or a walk of the reference folder. Used
   * for the entry file here and by the decision, which saves the new body as a new folder version.
   */
  async skillFiles(version: AssetVersion): Promise<SkillSourceFiles> {
    if (version.kind !== 'skill' || version.layout !== 'folder') return { status: 'refused', refusal: 'not-curatable' };
    try {
      if (version.storage.mode === 'store') return await this.storedSkillFiles(version.contentHash);
      return await this.referencedSkillFiles(version.storage.absolutePath);
    } catch (error) {
      if (isMissingFileError(error)) return { status: 'refused', refusal: 'body-unavailable' };
      throw error;
    }
  }

  private async readPromptBody(version: AssetVersion): Promise<SubjectBodyRead> {
    if (version.storage.mode === 'store') return this.readFileBody(this.store.blobPath(version.contentHash), version.contentHash);
    const pathCheck = await this.checkReferencePath(version.storage.absolutePath);
    if (pathCheck !== null) return { status: 'refused', refusal: pathCheck };
    return this.readFileBody(version.storage.absolutePath, version.contentHash);
  }

  private async readFileBody(absolutePath: string, expectedHash: Sha256 | null): Promise<SubjectBodyRead> {
    let bytes: Buffer | 'too-large';
    try {
      bytes = await readBounded(absolutePath);
    } catch (error) {
      if (isMissingFileError(error)) return { status: 'refused', refusal: 'body-unavailable' };
      throw error;
    }
    if (bytes === 'too-large') return { status: 'refused', refusal: 'body-too-large' };
    // A changed blob or reference file is not the version the owner reviewed runs of.
    if (expectedHash !== null && sha256Hex(bytes) !== expectedHash) return { status: 'refused', refusal: 'body-unavailable' };
    return decodeBody(bytes);
  }

  private async storedSkillFiles(contentHash: Sha256): Promise<SkillSourceFiles> {
    const manifestPath = this.store.blobPath(contentHash);
    if ((await stat(manifestPath)).size > MAX_FOLDER_MANIFEST_BYTES) return { status: 'refused', refusal: 'body-unavailable' };
    const manifestText = await readFile(manifestPath, 'utf8');
    if (sha256Hex(manifestText) !== contentHash) return { status: 'refused', refusal: 'body-unavailable' };
    let candidate: unknown;
    try {
      candidate = JSON.parse(manifestText);
    } catch {
      // The manifest blob matched its hash but is not JSON: a store integrity problem, not a body.
      return { status: 'refused', refusal: 'body-unavailable' };
    }
    const manifest = FolderManifestSchema.safeParse(candidate);
    if (!manifest.success) return { status: 'refused', refusal: 'body-unavailable' };
    return {
      status: 'listed',
      files: manifest.data.files.map((entry) => ({
        relativePath: entry.path,
        absolutePath: this.store.blobPath(entry.contentHash),
        contentHash: entry.contentHash,
      })),
    };
  }

  private async referencedSkillFiles(folderPath: string): Promise<SkillSourceFiles> {
    const pathCheck = await this.checkReferencePath(folderPath);
    if (pathCheck !== null) return { status: 'refused', refusal: pathCheck };
    const realFolder = await realpath(folderPath);
    // listFolderFiles refuses symlinks and special files, so every listed path stays inside the folder.
    const files = await listFolderFiles(realFolder);
    const listed: SkillSourceFile[] = [];
    for (const file of files) {
      const realFile = await realpath(join(realFolder, file.relativePath));
      if (!isInsideOrEqual(realFolder, realFile) || realFile === realFolder) return { status: 'refused', refusal: 'body-unavailable' };
      listed.push({ relativePath: file.relativePath, absolutePath: realFile, contentHash: null });
    }
    return { status: 'listed', files: listed };
  }

  /** A registered biometric path, or an unavailable registry (fail closed), refuses the subject. */
  private async checkReferencePath(absolutePath: string): Promise<BodyRefusal | null> {
    const redacted = await this.redactor.redactText(absolutePath);
    if (redacted.status === 'failed') return 'body-unavailable';
    return redacted.counts.biometric > 0 ? 'biometric' : null;
  }
}
