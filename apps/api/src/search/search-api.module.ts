import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CatalogViewsModule } from '../catalog/catalog-views.module';
import { SearchController } from './search.controller';

/** Http side of search by meaning; the query handlers come from the embeddings api module. */
@Module({
  imports: [CqrsModule, CatalogViewsModule],
  controllers: [SearchController],
})
export class SearchApiModule {}
