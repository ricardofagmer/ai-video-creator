import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { RecipeVersionViewAssembler } from '../recipes/recipe-version-view.assembler';
import { EmbeddingsApiModule } from '../search/embeddings-api.module';
import { AssetVersionViewAssembler } from './asset-version-view.assembler';

/**
 * The view builders every api module shares (C10 rev 3): asset versions with `searchIndex`,
 * `learnings` and `activation`, and recipe versions with `activation`. Re-exports the embeddings
 * api module, so an importer also gets `SearchIndexScheduler`.
 */
@Module({
  imports: [CqrsModule, EmbeddingsApiModule],
  providers: [AssetVersionViewAssembler, RecipeVersionViewAssembler],
  exports: [AssetVersionViewAssembler, RecipeVersionViewAssembler, EmbeddingsApiModule],
})
export class CatalogViewsModule {}
