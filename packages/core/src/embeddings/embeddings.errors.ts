import { type AssetRef } from '@studio/shared/catalog';

/** Error taxonomy category (rules/observability.md); the api filter maps `dependency` to 503. */
export type EmbeddingsErrorCategory = 'validation' | 'dependency' | 'internal';

/**
 * Base of every embeddings domain error. Messages carry refs and reason ids only: never a query,
 * a document, a note, a vector, a checksum value or a file path (SPEC 0003 section 6).
 */
export abstract class EmbeddingsError extends Error {
  abstract readonly category: EmbeddingsErrorCategory;
}

/**
 * The model is not `ready` (absent or rejected). The api answers 503 `embedding-unavailable`
 * (reason derived from the class name); lexical search is unaffected.
 */
export class EmbeddingUnavailableError extends EmbeddingsError {
  override readonly category = 'dependency';

  constructor(readonly modelState: 'absent' | 'rejected') {
    super(`Search by meaning is unavailable: the embedding model is ${modelState}`);
    this.name = 'EmbeddingUnavailableError';
  }
}

export interface SemanticSearchIssue {
  path: string;
  message: string;
}

/** The search body failed validation after normalization. The query text is never echoed. */
export class InvalidSemanticSearchError extends EmbeddingsError {
  override readonly category = 'validation';

  constructor(readonly issues: readonly SemanticSearchIssue[]) {
    super(`Invalid semantic search: ${issues.map((issue) => issue.path || '<root>').join(', ')}`);
    this.name = 'InvalidSemanticSearchError';
  }
}

/** The runtime returned vectors of the wrong count, size or values; nothing is written. */
export class EmbeddingOutputInvalidError extends EmbeddingsError {
  override readonly category = 'internal';

  constructor(readonly reason: 'count' | 'dimensions' | 'not-finite' | 'zero-vector') {
    super(`The embedding runtime returned an invalid output (${reason})`);
    this.name = 'EmbeddingOutputInvalidError';
  }
}

/** A catalog row whose tags or details do not parse; the row is skipped and stays pending. */
export class EmbeddingSourceCorruptError extends EmbeddingsError {
  override readonly category = 'internal';

  constructor(readonly ref: AssetRef, options?: ErrorOptions) {
    super(`Catalog row ${ref} cannot be turned into an embedding document`, options);
    this.name = 'EmbeddingSourceCorruptError';
  }
}

/**
 * The committed model manifest is unreadable, does not match `EmbeddingModelManifestSchema`, or
 * still carries placeholder pins (`unpinned`: an all-zero sha-256 or a zero size, see
 * `isPinnedManifest`).
 */
export class InvalidModelManifestError extends EmbeddingsError {
  override readonly category = 'internal';

  constructor(readonly reason: 'unreadable' | 'too-large' | 'invalid-json' | 'schema-mismatch' | 'unpinned', options?: ErrorOptions) {
    super(`The embedding model manifest is not usable (${reason})`, options);
    this.name = 'InvalidModelManifestError';
  }
}

/**
 * The production adapter could not build its inference session from the verified model folder,
 * or `embed` ran before `load`. `file` is the manifest-relative name, never a path; the runtime
 * treats any load failure as a rejected model (SPEC 0003 section 5.2).
 */
export class EmbeddingModelLoadError extends EmbeddingsError {
  override readonly category = 'dependency';

  constructor(
    readonly reason: 'not-loaded' | 'model-files' | 'file-mismatch' | 'tokenizer' | 'session-shape',
    readonly file: string | null = null,
    options?: ErrorOptions,
  ) {
    super(`The embedding model could not be loaded (${reason}${file === null ? '' : `: ${file}`})`, options);
    this.name = 'EmbeddingModelLoadError';
  }
}
