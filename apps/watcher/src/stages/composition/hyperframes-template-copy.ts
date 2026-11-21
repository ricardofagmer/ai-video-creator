import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { type FileHandle, mkdir, open } from 'node:fs/promises';
import { dirname, extname } from 'node:path';
import { AssetStoreError, isInsideOrEqual, type FolderFileSource } from '@studio/core/asset-store';
import { hyperframesBounds, templateFolderIssues, type TemplateFolderEntry } from '@studio/shared/hyperframes';
import { type ResolvedAsset } from '@studio/shared/ports';
import { type HyperframesStagePorts } from './hyperframes-stage.ports';

/*
 * Check 8 of SPEC 0008 section 5.2: the template folder is copied into the step's private scratch
 * directory, every copy is hashed against the folder manifest, and `templateFolderIssues` runs on
 * the copy. The render only ever sees this copy, never the store or a referenced folder. Any
 * failure is `template-not-self-contained`; no path or file content leaves this module.
 */

const TEXT_EXTENSIONS = new Set(['.html', '.css', '.svg', '.js']);
/** The template folder is a few megabytes at most; anything near this is not a template. */
const TEMPLATE_MAX_BYTES = 256 * 1024 * 1024;
/** A link at the source path fails the open; a FIFO swapped in cannot block it (section 17.8). */
const SOURCE_OPEN_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
const COPY_CHUNK_BYTES = 1_048_576;

export type TemplateCopyOutcome = { status: 'staged' } | { status: 'refused' };

const refused: TemplateCopyOutcome = { status: 'refused' };

/** A small regular file's text, opened without following a link; null when it cannot be read whole. */
async function readTextBounded(filePath: string): Promise<string | null> {
  const handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size > hyperframesBounds.maxTextFileBytes) return null;
    return await handle.readFile({ encoding: 'utf8' });
  } finally {
    await handle.close();
  }
}

function isCopyRefusal(error: unknown): boolean {
  if (error instanceof AssetStoreError) return true;
  return error instanceof Error && 'code' in error && typeof error.code === 'string';
}

async function writeAll(target: FileHandle, buffer: Buffer, length: number): Promise<void> {
  let written = 0;
  while (written < length) {
    const { bytesWritten } = await target.write(buffer, written, length - written);
    written += bytesWritten;
  }
}

/**
 * Streams from the open source into the target, hashing the bytes as they are read. Reads at most
 * `sizeBytes + 1` bytes and stops before writing the chunk that goes past `sizeBytes`, so a refused
 * file never puts more than the manifest's size into the target.
 */
async function streamBounded(source: FileHandle, target: FileHandle, file: FolderFileSource, signal: AbortSignal): Promise<boolean> {
  const hash = createHash('sha256');
  const limit = file.sizeBytes + 1;
  const buffer = Buffer.alloc(Math.min(COPY_CHUNK_BYTES, limit));
  let total = 0;
  for (;;) {
    signal.throwIfAborted();
    const length = Math.min(buffer.byteLength, limit - total);
    if (length <= 0) break;
    const { bytesRead } = await source.read(buffer, 0, length, total);
    if (bytesRead === 0) break;
    total += bytesRead;
    if (total > file.sizeBytes) return false;
    hash.update(buffer.subarray(0, bytesRead));
    await writeAll(target, buffer, bytesRead);
  }
  return total === file.sizeBytes && hash.digest('hex') === file.contentHash;
}

/**
 * Section 17.8 (L3): the source is opened once without following a link, must be a regular file of
 * the manifest's size, and is copied into an exclusively created `0600` target with the hash taken
 * over the bytes read from that same handle. Answers whether the copy matches the manifest.
 */
async function copyBounded(file: FolderFileSource, target: string, signal: AbortSignal): Promise<boolean> {
  const source = await open(file.absolutePath, SOURCE_OPEN_FLAGS);
  try {
    const stats = await source.stat();
    if (!stats.isFile() || stats.size !== file.sizeBytes) return false;
    const destination = await open(target, 'wx', 0o600);
    try {
      return await streamBounded(source, destination, file, signal);
    } finally {
      await destination.close();
    }
  } finally {
    await source.close();
  }
}

async function copyAndVerify(template: ResolvedAsset, targetDir: string, ports: HyperframesStagePorts, signal: AbortSignal): Promise<TemplateCopyOutcome> {
  const files = await ports.listTemplateFiles(
    { storage: template.storage, contentHash: template.contentHash, absolutePath: template.absolutePath },
    { maxBytes: TEMPLATE_MAX_BYTES, signal },
  );
  if (files.length > hyperframesBounds.maxFiles) return refused;
  const entries: TemplateFolderEntry[] = [];
  for (const file of files) {
    const target = `${targetDir}/${file.relativePath}`;
    if (!isInsideOrEqual(targetDir, target) || target === targetDir) return refused;
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    if (!(await copyBounded(file, target, signal))) return refused;
    const text = TEXT_EXTENSIONS.has(extname(file.relativePath).toLowerCase()) ? await readTextBounded(target) : null;
    entries.push({ path: file.relativePath, type: 'file', text });
  }
  return templateFolderIssues(entries).length === 0 ? { status: 'staged' } : refused;
}

/** Stages `template` into `targetDir` (which must not exist yet) and checks the copy. */
export async function stageTemplateCopy(
  template: ResolvedAsset,
  targetDir: string,
  ports: HyperframesStagePorts,
  signal: AbortSignal,
): Promise<TemplateCopyOutcome> {
  // A biometric or file-layout asset is never a template folder; its path must not reach a render.
  if (template.layout !== 'folder' || template.sensitivity === 'biometric') return refused;
  await mkdir(targetDir, { mode: 0o700 });
  try {
    return await copyAndVerify(template, targetDir, ports, signal);
  } catch (error) {
    if (signal.aborted || !isCopyRefusal(error)) throw error;
    // A changed, missing, linked or oversized file: the folder no longer matches its version.
    return refused;
  }
}
