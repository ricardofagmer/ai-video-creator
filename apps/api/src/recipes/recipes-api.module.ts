import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CatalogViewsModule } from '../catalog/catalog-views.module';
import { RecipesController } from './recipes.controller';

/**
 * Http side of recipes; the handlers come from core `RecipesModule` and `PromotionModule`,
 * imported by the root. `CatalogViewsModule` supplies the `activation` view builder.
 */
@Module({
  imports: [CqrsModule, CatalogViewsModule],
  controllers: [RecipesController],
})
export class RecipesApiModule {}
