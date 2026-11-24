export {
  EmbeddingModelLoadError,
  EmbeddingOutputInvalidError,
  EmbeddingSourceCorruptError,
  EmbeddingUnavailableError,
  EmbeddingsError,
  InvalidModelManifestError,
  InvalidSemanticSearchError,
  type EmbeddingsErrorCategory,
  type SemanticSearchIssue,
} from './embeddings.errors';
export { EmbeddingsModule, type EmbeddingModelPortProvider, type EmbeddingsModuleOptions } from './embeddings.module';
export { EMBEDDING_MODEL_PORT, type EmbeddingModelPort, type EmbeddingRole } from './embedding-model.port';
export { isPinnedManifest, parseEmbeddingModelManifest, readEmbeddingModelManifest } from './embedding-manifest';
export { onnxEmbeddingModelPortProvider, runtimeEmbeddingManifestFile, type OnnxEmbeddingModelOptions } from './onnx-embedding-model.provider';
export { EMBED_BATCH_SIZE, EmbeddingIndexer, type EmbedScope, type EmbeddingSyncSummary } from './embedding-indexer.service';
export { EmbeddingIndexStatusService, type SearchIndexState, type SearchIndexStatus } from './embedding-index-status.service';
export { verifyModelDirectory, type ModelIntegrityResult, type ModelRejectionReason } from './model-integrity';
export { GetSearchIndexStatusQuery } from './queries/get-search-index-status.query';
export {
  SemanticSearchQuery,
  type SemanticSearchContext,
  type SemanticSearchHit,
  type SemanticSearchResult,
} from './queries/semantic-search.query';
