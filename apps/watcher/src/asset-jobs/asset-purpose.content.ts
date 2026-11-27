import { constants } from 'node:fs';
import { open, realpath, type FileHandle } from 'node:fs/promises';
import { Logger } from '@nestjs/common';
import { type QueryBus } from '@nestjs/cqrs';
import { CatalogError, GetEntryFileTextQuery } from '@studio/core/catalog';
import { type RedactorService } from '@studio/core/redaction';
import { type AssetRef, type AssetVersion } from '@studio/shared/catalog';
import { type AssetPurposeImageMimeType, type AssetResolverPort, type ReferenceAnalysisReaderPort } from '@studio/shared/ports';
import { boundedPurposeText, NO_PURPOSE_CONTENT, PURPOSE_IMAGE_MAX_BYTES, type PurposeContent } from './asset-purpose.input';

export interface AssetPurposeContentDependencies {
  /** The daemon root's QueryBus; the entry text is read through core `GetEntryFileTextHandler`. */
  queries: QueryBus;
  /** The catalog resolver (read-only, full re-hash), the same instance the stages use. */
  assets: AssetResolverPort;
  /** Core `ReferenceAnalysisReader`: only `done` analyses, never an error. */
  analyses: ReferenceAnalysisReaderPort;
  /** Checks the real path of an image against the biometric path list. */
  redactor: RedactorService;
}

export interface AssetPurposeContentRequest {
  ref: AssetRef;
  version: AssetVersion;
  signal: AbortSignal;
}

/** Why a version that could carry content is sent as metadata only; logged, never content. */
type ContentSkipCode =
  | 'entry-unavailable'
  | 'entry-empty'
  | 'image-unresolved'
  | 'image-type'
  | 'image-too-large'
  | 'image-unreadable'
  | 'path-unreadable'
  | 'biometric-path'
  | 'redaction-failed'
  | 'analysis-missing';

type ContentOutcome = { status: 'read'; content: PurposeContent } | { status: 'skipped'; code: ContentSkipCode };
type RealPathCheck = { status: 'clear'; path: string } | { status: 'skipped'; code: ContentSkipCode };

const PURPOSE_IMAGE_TYPES: readonly AssetPurposeImageMimeType[] = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * ADR 0012 decision 5, C-P6, AP-06: what the purpose writer reads beyond the metadata.
 * - prompt, skill, template: the entry text through `GetEntryFileTextHandler`, cut to 12 000 chars;
 * - image: the bytes of a stored image (never a link), at most 5 MB, through the catalog resolver;
 * - video reference: its `done` analysis through `ReferenceAnalysisReader`;
 * - every other kind, link rows and anything unreadable: metadata only (`none`).
 * A biometric row is never read at all: the row is checked first, and for an image the resolved row
 * and the real path are checked again, as the reference analysis does; a check that cannot run
 * sends metadata only (fails closed). Content is guidance, so a read failure never fails the job;
 * an abort still propagates. Logs carry the ref, kind, counts and codes, never content or a path.
 */
export class AssetPurposeContentReader {
  private readonly logger = new Logger(AssetPurposeContentReader.name);

  constructor(private readonly dependencies: AssetPurposeContentDependencies) {}

  async read(request: AssetPurposeContentRequest): Promise<PurposeContent> {
    const { ref, version } = request;
    if (version.sensitivity === 'biometric') return NO_PURPOSE_CONTENT;
    const outcome = await this.outcomeOf(request);
    request.signal.throwIfAborted();
    if (outcome.status === 'skipped') {
      this.logger.warn({ event: 'asset-job.purpose-content-skipped', ref, kind: version.kind, code: outcome.code });
      return NO_PURPOSE_CONTENT;
    }
    this.logger.log({ event: 'asset-job.purpose-content-read', ref, kind: version.kind, content: outcome.content.kind, size: sizeOf(outcome.content) });
    return outcome.content;
  }

  private async outcomeOf(request: AssetPurposeContentRequest): Promise<ContentOutcome> {
    const { version } = request;
    switch (version.kind) {
      case 'prompt':
      case 'skill':
      case 'template':
        return this.entryText(request);
      case 'image':
        return isStoredImage(version) ? this.storedImage(request) : { status: 'read', content: NO_PURPOSE_CONTENT };
      case 'reference':
        return version.details.subKind === 'video' ? this.doneAnalysis(request.ref) : { status: 'read', content: NO_PURPOSE_CONTENT };
      default:
        return { status: 'read', content: NO_PURPOSE_CONTENT };
    }
  }

  /** The entry text; a catalog refusal (no entry file, too large, not UTF-8, a link) is metadata only. */
  private async entryText(request: AssetPurposeContentRequest): Promise<ContentOutcome> {
    const { storage } = request.version;
    if (storage.mode === 'reference') {
      const check = await this.realPathCheck(storage.absolutePath);
      if (check.status === 'skipped') return check;
    }
    let text: string;
    try {
      text = (await this.dependencies.queries.execute(new GetEntryFileTextQuery(request.ref, request.signal))).text;
    } catch (error) {
      request.signal.throwIfAborted();
      if (error instanceof CatalogError) return { status: 'skipped', code: 'entry-unavailable' };
      throw error;
    }
    if (text.trim().length === 0) return { status: 'skipped', code: 'entry-empty' };
    return { status: 'read', content: { kind: 'text', ...boundedPurposeText(text) } };
  }

  /** One stored image, re-hashed by the resolver, held to its type and size, read once and never copied. */
  private async storedImage(request: AssetPurposeContentRequest): Promise<ContentOutcome> {
    const resolution = await this.dependencies.assets.resolve({ ref: request.ref, expectedContentHash: null, signal: request.signal });
    if (resolution.status !== 'resolved') return { status: 'skipped', code: 'image-unresolved' };
    const { asset } = resolution;
    if (asset.sensitivity === 'biometric') return { status: 'skipped', code: 'biometric-path' };
    const mimeType = purposeImageType(asset.mimeType);
    if (mimeType === null) return { status: 'skipped', code: 'image-type' };
    if (asset.sizeBytes > PURPOSE_IMAGE_MAX_BYTES) return { status: 'skipped', code: 'image-too-large' };
    const check = await this.realPathCheck(asset.absolutePath);
    if (check.status === 'skipped') return check;
    const bytes = await readBoundedFile(check.path, PURPOSE_IMAGE_MAX_BYTES);
    if (bytes.status !== 'read') return { status: 'skipped', code: bytes.status === 'too-large' ? 'image-too-large' : 'image-unreadable' };
    return { status: 'read', content: { kind: 'image', mimeType, bytes: bytes.bytes } };
  }

  /**
   * The real path, cleared only when the redactor's biometric path list does not match it, as core's
   * agent tools and the reference analysis check it. A path that cannot be resolved or checked is
   * skipped (fails closed); the path itself is never logged.
   */
  private async realPathCheck(absolutePath: string): Promise<RealPathCheck> {
    let path: string;
    try {
      path = await realpath(absolutePath);
    } catch {
      return { status: 'skipped', code: 'path-unreadable' };
    }
    const redacted = await this.dependencies.redactor.redactText(path);
    if (redacted.status !== 'redacted') return { status: 'skipped', code: 'redaction-failed' };
    if (redacted.counts.biometric > 0) return { status: 'skipped', code: 'biometric-path' };
    return { status: 'clear', path };
  }

  private async doneAnalysis(ref: AssetRef): Promise<ContentOutcome> {
    const [entry] = await this.dependencies.analyses.readDone([ref]);
    if (entry === undefined || entry.ref !== ref) return { status: 'skipped', code: 'analysis-missing' };
    return { status: 'read', content: { kind: 'reference-analysis', mode: entry.mode, analysis: entry.analysis } };
  }
}

/** A stored image file; an image saved by link (`text/plain` holding a URL) is never fetched. */
function isStoredImage(version: Extract<AssetVersion, { kind: 'image' }>): boolean {
  return version.storage.mode === 'store' && version.layout === 'file' && version.mimeType.startsWith('image/');
}

function purposeImageType(mimeType: string): AssetPurposeImageMimeType | null {
  return PURPOSE_IMAGE_TYPES.find((allowed) => allowed === mimeType) ?? null;
}

type BoundedRead = { status: 'read'; bytes: Uint8Array } | { status: 'too-large' } | { status: 'unreadable' };

/**
 * The whole file when it holds 1..`maxBytes` bytes. Opened without following a link; the size is
 * checked on the open handle and the read stops one byte past the bound, so a file that grew after
 * the resolver hashed it is refused rather than cut. Store blobs are immutable, so this only guards
 * against a file changed behind the catalog's back.
 */
async function readBoundedFile(path: string, maxBytes: number): Promise<BoundedRead> {
  let handle: FileHandle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    return { status: 'unreadable' };
  }
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size === 0) return { status: 'unreadable' };
    if (stats.size > maxBytes) return { status: 'too-large' };
    const buffer = Buffer.alloc(stats.size + 1);
    let filled = 0;
    while (filled < buffer.byteLength) {
      const { bytesRead } = await handle.read(buffer, filled, buffer.byteLength - filled, filled);
      if (bytesRead === 0) break;
      filled += bytesRead;
    }
    if (filled > maxBytes) return { status: 'too-large' };
    if (filled !== stats.size) return { status: 'unreadable' };
    if (filled === 0) return { status: 'unreadable' };
    return { status: 'read', bytes: buffer.subarray(0, filled) };
  } catch {
    return { status: 'unreadable' };
  } finally {
    await handle.close();
  }
}

/** Characters for a text, bytes for an image, 1 for an analysis, 0 for none; logged as a count only. */
function sizeOf(content: PurposeContent): number {
  switch (content.kind) {
    case 'none':
      return 0;
    case 'text':
      return content.text.length;
    case 'image':
      return content.bytes.byteLength;
    case 'reference-analysis':
      return 1;
  }
}
