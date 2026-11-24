import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CatalogModule } from '../catalog/catalog.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CreateRecipeHandler } from './commands/create-recipe.handler';
import { SaveRecipeVersionHandler } from './commands/save-recipe-version.handler';
import { SetRecipeStatusHandler } from './commands/set-recipe-status.handler';
import { GetRecipeVersionHandler } from './queries/get-recipe-version.handler';
import { ListRecipeVersionsHandler } from './queries/list-recipe-versions.handler';
import { RecipeBindingVerifier } from './recipe-binding.verifier';
import { RecipeCompositionCheck } from './recipe-composition.check';
import { RecipeVersionRepository } from './recipe-version.repository';

/**
 * Recipes (PRD 6): commands and queries go through the CQRS buses, run by the api and the CLI
 * (ADR 0003: the only SQLite writers). Binding pins are checked through the catalog's queries,
 * so the catalog module is imported for its handlers. `RecipeBindingVerifier` is exported for the
 * runs module, which re-checks the pins when a run is created.
 */
@Module({
  imports: [CqrsModule, PrismaModule, CatalogModule],
  providers: [
    RecipeVersionRepository,
    RecipeBindingVerifier,
    RecipeCompositionCheck,
    CreateRecipeHandler,
    SaveRecipeVersionHandler,
    SetRecipeStatusHandler,
    GetRecipeVersionHandler,
    ListRecipeVersionsHandler,
  ],
  exports: [RecipeBindingVerifier, RecipeCompositionCheck],
})
export class RecipesModule {}
