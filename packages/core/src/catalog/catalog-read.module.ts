import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AssetStoreModule } from '../asset-store/asset-store.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AssetVersionRepository } from './asset-version.repository';
import { CatalogAssetResolver } from './catalog-asset-resolver';
import { FindAssetVersionsByContentHashHandler } from './queries/find-asset-versions-by-hash.handler';
import { GetAssetVersionHandler } from './queries/get-asset-version.handler';
import { ListAssetVersionsHandler } from './queries/list-asset-versions.handler';
import { SearchAssetsHandler } from './queries/search-assets.handler';

/**
 * Read side of the catalog for processes that must never write it: the watcher (ADR 0003: it reads
 * SQLite, never writes it). It registers the query handlers (the agents and their tools resolve
 * assets through the QueryBus) and no command handler, so no catalog write is reachable from a
 * composition root that imports only this module. A root that uses the queries registers
 * `CqrsModule.forRoot()`. The api and CLI keep `CatalogModule`; never import both in one root,
 * or each query would have two handlers.
 */
@Module({
  imports: [CqrsModule, PrismaModule, AssetStoreModule],
  providers: [
    AssetVersionRepository,
    CatalogAssetResolver,
    GetAssetVersionHandler,
    ListAssetVersionsHandler,
    SearchAssetsHandler,
    FindAssetVersionsByContentHashHandler,
  ],
  exports: [CatalogAssetResolver],
})
export class CatalogReadModule {}
