import { z } from 'zod';
import { RelativePathSchema, Sha256Schema } from '../common/ids';

/** B8: the embedding document is cut at this many characters, metadata and notes first. */
export const EMBEDDING_DOCUMENT_MAX_CHARS = 2000;

/** Section 5.2 query flow step 1: a longer semantic query is refused. */
export const SEMANTIC_SEARCH_QUERY_MAX_CHARS = 500;

/**
 * `<model id>@<revision>`. It also names the model folder
 * `<data home>/models/embeddings/<modelRef>/` (docs/RUN-FORMAT.md section 22), so it is one path
 * segment: no `/`, and it cannot start with `.`.
 */
const modelRefPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*@[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * The committed model manifest `scripts/models/embedding-model.manifest.json` (SPEC 0003 section
 * 5.2, ADR 0004). It pins every model file by sha-256 and size; the installer verifies them after
 * download and core re-hashes them before the first inference of each process. A missing file, a
 * size or a hash mismatch refuses the load. A new model is a new manifest with a new `modelRef`.
 */
export const EmbeddingModelManifestSchema = z
  .object({
    modelRef: z.string().max(200).regex(modelRefPattern, 'expected <model id>@<revision> as one path segment'),
    dimensions: z.number().int().min(1).max(4096),
    /** Prepended to a search query before embedding (e.g. `query: `); may be empty. */
    queryPrefix: z.string().max(64),
    /** Prepended to an embedding document before embedding (e.g. `passage: `); may be empty. */
    passagePrefix: z.string().max(64),
    maxInputTokens: z.number().int().positive(),
    files: z
      .array(
        z
          .object({
            /** Relative to the model folder; `RelativePathSchema` refuses `..` and absolute paths. */
            path: RelativePathSchema,
            sha256: Sha256Schema,
            sizeBytes: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .min(1)
      .max(64),
  })
  .strict();
export type EmbeddingModelManifest = z.infer<typeof EmbeddingModelManifestSchema>;
