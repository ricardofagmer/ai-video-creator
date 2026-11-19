import { type EmbeddingModelManifest } from '@studio/shared/catalog';

/** `query` for a search text, `passage` for an embedding document (SPEC 0003 section 5.2). */
export type EmbeddingRole = 'query' | 'passage';

/** Nest injection token of the one production adapter (ADR 0004). */
export const EMBEDDING_MODEL_PORT = Symbol('EMBEDDING_MODEL_PORT');

/**
 * The local embedding runtime as core sees it (SPEC 0003 section 5.2, ADR 0004). One production
 * adapter implements it in-process; tests use a deterministic double beside the tests, never a
 * mock adapter in a production path.
 *
 * Contract every implementation keeps:
 * - It never opens a network connection. Remote model loading and remote file resolution are off;
 *   a missing file is an error, never a fetch (D10).
 * - `load` is called at most once per process, and only after core re-hashed every manifest file
 *   in `modelDirectory` and found them all intact. It reads nothing outside that folder.
 * - It never logs or retains the texts it embeds.
 */
export interface EmbeddingModelPort {
  /**
   * The committed manifest `scripts/models/embedding-model.manifest.json`, validated with
   * `EmbeddingModelManifestSchema` (see `readEmbeddingModelManifest`). Read once when the adapter
   * is built; throws `InvalidModelManifestError` when it is not usable.
   */
  manifest(): EmbeddingModelManifest;

  /** Builds the inference session from the verified model folder. */
  load(modelDirectory: string): Promise<void>;

  /**
   * One vector per text, in input order, each of `manifest().dimensions` numbers. The adapter
   * prepends `queryPrefix` or `passagePrefix` from the manifest according to `role`; callers pass
   * the text without prefix. Called with at most 8 texts (B9).
   */
  embed(texts: readonly string[], role: EmbeddingRole): Promise<readonly Float32Array[]>;
}
