import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { EmbeddingsModule, onnxEmbeddingModelPortProvider, runtimeEmbeddingManifestFile } from '@studio/core/embeddings';
import { RUNTIME_DIR_ENV_VAR, nodeRuntimeFileSystem, resolveStudioRuntime } from '@studio/core/runtime';
import { SearchIndexScheduler } from './search-index.scheduler';

/**
 * Plan C3 rev 2, DI-AC-03: the manifest comes from the locator's resource root, the checkout in
 * development and `payload/resources/` when packaged. Resolved when the module initializes, so an
 * invalid runtime folder fails the boot with its typed error instead of falling back to the checkout.
 */
function embeddingManifestPath(): string {
  const runtime = resolveStudioRuntime({ override: process.env[RUNTIME_DIR_ENV_VAR], fileSystem: nodeRuntimeFileSystem });
  return runtimeEmbeddingManifestFile(runtime);
}

/**
 * The api's one instance of the embeddings module (SPEC 0003 section 5.2, ADR 0004): the model
 * loads lazily inside the api process, from the verified model folder only. Every api module that
 * needs the indexer or the index state imports this module, never `EmbeddingsModule.forRoot`
 * again, so the semantic search handlers are registered on the bus once.
 */
@Module({
  imports: [CqrsModule, EmbeddingsModule.forRoot({ modelPort: onnxEmbeddingModelPortProvider({ manifestPath: embeddingManifestPath }) })],
  providers: [SearchIndexScheduler],
  exports: [SearchIndexScheduler, EmbeddingsModule],
})
export class EmbeddingsApiModule {}
