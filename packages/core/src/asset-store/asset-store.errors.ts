/** Error taxonomy category (rules/observability.md); the api maps it to a status code. */
export type AssetStoreErrorCategory = 'validation' | 'not_found' | 'internal';

/**
 * Base of every asset-store failure. Messages never contain a file path or file content, so they
 * are safe to log even when the subject is biometric material (PRD 12).
 */
export abstract class AssetStoreError extends Error {
  abstract readonly category: AssetStoreErrorCategory;
}

export class ContentTooLargeError extends AssetStoreError {
  override readonly category = 'validation';

  constructor(readonly limitBytes: number) {
    super(`Content exceeds the size limit of ${limitBytes} bytes`);
    this.name = 'ContentTooLargeError';
  }
}

export type UnsafePathReason =
  | 'not-absolute'
  | 'not-normalized'
  | 'inside-store'
  | 'not-a-file'
  | 'not-a-folder'
  | 'escapes-root';

/** A caller-supplied path that fails the traversal and containment checks. */
export class UnsafePathError extends AssetStoreError {
  override readonly category = 'validation';

  constructor(readonly reason: UnsafePathReason) {
    super(`Path refused: ${reason}`);
    this.name = 'UnsafePathError';
  }
}

export class SourceNotFoundError extends AssetStoreError {
  override readonly category = 'not_found';

  constructor() {
    super('The source file or folder does not exist');
    this.name = 'SourceNotFoundError';
  }
}

export type FolderRejection = 'symlink' | 'special-file' | 'invalid-name' | 'too-many-files' | 'too-deep' | 'empty';

/** `relativePath` is kept as a field for the caller; the message stays path-free. */
export class UnsupportedFolderError extends AssetStoreError {
  override readonly category = 'validation';

  constructor(
    readonly rejection: FolderRejection,
    readonly relativePath: string | null,
  ) {
    super(`Folder refused: ${rejection}`);
    this.name = 'UnsupportedFolderError';
  }
}

/**
 * A file-system call failed. Only the errno code is kept: Node's own message and `path` field
 * name the absolute path, which may lie under a biometric reference (PRD 12), so the raw error is
 * dropped, not chained as `cause`. `code` stays readable for callers that branch on `ENOENT`.
 */
export class AssetStoreIoError extends AssetStoreError {
  override readonly category: AssetStoreErrorCategory;

  constructor(readonly code: string) {
    super(`File system operation failed (${code})`);
    this.name = 'AssetStoreIoError';
    this.category = code === 'ENOENT' || code === 'ENOTDIR' ? 'not_found' : 'internal';
  }
}

/** A stream yielded something other than bytes or text; a programming error upstream. */
export class UnsupportedChunkError extends AssetStoreError {
  override readonly category = 'internal';

  constructor() {
    super('Content stream yielded a chunk that is not bytes');
    this.name = 'UnsupportedChunkError';
  }
}
