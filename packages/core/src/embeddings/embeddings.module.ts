import { Module, type ClassProvider, type DynamicModule, type FactoryProvider, type Provider } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AssetStoreModule } from '../asset-store/asset-store.module';
import { PathsModule } from '../paths/paths.module';
import { PrismaModule } from '../prisma/prisma.module';
import { EmbeddingDocumentPlanner } from './embedding-document.planner';
import { EmbeddingIndexRepository } from './embedding-index.repository';
import { EmbeddingIndexStatusService } from './embedding-index-status.service';
import { EmbeddingIndexer } from './embedding-indexer.service';
import { EMBEDDING_MODEL_PORT, type EmbeddingModelPort } from './embedding-model.port';
import { EmbeddingModelRuntime } from './embedding-model.runtime';
import { GetSearchIndexStatusHandler } from './queries/get-search-index-status.handler';
import { SemanticSearchHandler } from './queries/semantic-search.handler';
import { StoredVectorCache } from './stored-vector.cache';
import { ContentStoreTextReader } from './stored-text.reader';

/** How the composition root supplies the one production adapter of `EmbeddingModelPort`. */
export type EmbeddingModelPortProvider =
  | Omit<ClassProvider<EmbeddingModelPort>, 'provide'>
  | Omit<FactoryProvider<EmbeddingModelPort>, 'provide'>;

export interface EmbeddingsModuleOptions {
  modelPort: EmbeddingModelPortProvider;
}

/**
 * Search by meaning (SPEC 0003 section 5.2, ADR 0004): the model runtime guard, the indexer (the
 * single writer of the embedding columns), the semantic search query and the index status query.
 * For the api and the CLI only (ADR 0003 single-writer rule, B9): no file under `apps/watcher`
 * imports it. The root registers `CqrsModule.forRoot()` and passes the adapter; core holds no
 * network client and no runtime package.
 */
@Module({})
export class EmbeddingsModule {
  static forRoot(options: EmbeddingsModuleOptions): DynamicModule {
    const modelPort: Provider = { provide: EMBEDDING_MODEL_PORT, ...options.modelPort };
    return {
      module: EmbeddingsModule,
      imports: [CqrsModule, PrismaModule, AssetStoreModule, PathsModule],
      providers: [
        modelPort,
        EmbeddingModelRuntime,
        EmbeddingIndexRepository,
        ContentStoreTextReader,
        EmbeddingDocumentPlanner,
        EmbeddingIndexer,
        EmbeddingIndexStatusService,
        StoredVectorCache,
        SemanticSearchHandler,
        GetSearchIndexStatusHandler,
      ],
      exports: [EmbeddingIndexer, EmbeddingIndexStatusService],
    };
  }
}
