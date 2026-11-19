import { homedir } from 'node:os';
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AssetStoreModule } from '../asset-store/asset-store.module';
import { CatalogModule } from '../catalog/catalog.module';
import { RecipesModule } from '../recipes/recipes.module';
import { AssetSeeder } from './asset-seeder';
import { SeedCatalogHandler } from './commands/seed-catalog.handler';
import { RecipeSeeder } from './recipe-seeder';
import { SEED_SOURCE_ROOT_ENV_VAR, SeedSettings, resolveSeedSourceRoot } from './seed-source';

/**
 * `studio catalog seed` (SPEC 0002 R1-07), for the CLI and the api only: it writes SQLite through
 * the catalog and recipes command handlers (ADR 0003 "Who writes what"). The environment is read
 * once, here, when the composition root builds the module graph; callers go through the
 * `CommandBus` with `SeedCatalogCommand`. The composition root registers `CqrsModule.forRoot()`.
 */
@Module({
  imports: [CqrsModule, AssetStoreModule, CatalogModule, RecipesModule],
  providers: [
    {
      provide: SeedSettings,
      useFactory: (): SeedSettings =>
        new SeedSettings(resolveSeedSourceRoot({ homeDirectory: homedir(), override: process.env[SEED_SOURCE_ROOT_ENV_VAR] })),
    },
    AssetSeeder,
    RecipeSeeder,
    SeedCatalogHandler,
  ],
})
export class SeedModule {}
