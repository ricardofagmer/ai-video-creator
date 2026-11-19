import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { EmbeddingsModule, onnxEmbeddingModelPortProvider } from '@studio/core/embeddings';
import { SearchIndexScheduler } from './search-index.scheduler';

/**
 * The api's one instance of the embeddings module (SPEC 0003 section 5.2, ADR 0004): the model
 * loads lazily inside the api process, from the verified model folder only. Every api module that
 * needs the indexer or the index state imports this module, never `EmbeddingsModule.forRoot`
 * again, so the semantic search handlers are registered on the bus once.
 */
@Module({
  imports: [CqrsModule, EmbeddingsModule.forRoot({ modelPort: onnxEmbeddingModelPortProvider() })],
  providers: [SearchIndexScheduler],
  exports: [SearchIndexScheduler, EmbeddingsModule],
})
export class EmbeddingsApiModule {}
