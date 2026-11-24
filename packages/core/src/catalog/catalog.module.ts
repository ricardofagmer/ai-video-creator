import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AssetStoreModule } from '../asset-store/asset-store.module';
import { PathsModule } from '../paths/paths.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BIOMETRIC_REFERENCE_SOURCE, PrismaBiometricReferenceSource } from '../redaction/biometric-reference.source';
import { AssetContentService } from './asset-content';
import { AssetVersionRepository } from './asset-version.repository';
import { BiometricSourceGuard } from './biometric-source.guard';
import { CatalogAssetResolver } from './catalog-asset-resolver';
import { HyperframesTemplateCheck } from './hyperframes-template.check';
import { SkillEntryFileService } from './skill-entry-file';
import { CreateAssetHandler } from './commands/create-asset.handler';
import { SaveAssetVersionHandler } from './commands/save-asset-version.handler';
import { SetAssetStatusHandler } from './commands/set-asset-status.handler';
import { FindAssetVersionsByContentHashHandler } from './queries/find-asset-versions-by-hash.handler';
import { GetAssetVersionHandler } from './queries/get-asset-version.handler';
import { GetEntryFileTextHandler } from './queries/get-entry-file-text.handler';
import { GetImageContentHandler } from './queries/get-image-content.handler';
import { ListAssetVersionsHandler } from './queries/list-asset-versions.handler';
import { SearchAssetsHandler } from './queries/search-assets.handler';

/**
 * Catalog (PRD 5): commands and queries go through the CQRS buses; the composition root
 * (api, CLI) registers `CqrsModule.forRoot()`. The watcher imports `CatalogReadModule` instead
 * (no buses, no command handlers; ADR 0003: it reads SQLite, never writes it).
 */
@Module({
  imports: [CqrsModule, PathsModule, PrismaModule, AssetStoreModule],
  providers: [
    AssetVersionRepository,
    AssetContentService,
    // Imports and non-biometric references are checked against the registered biometric paths.
    { provide: BIOMETRIC_REFERENCE_SOURCE, useClass: PrismaBiometricReferenceSource },
    BiometricSourceGuard,
    CatalogAssetResolver,
    HyperframesTemplateCheck,
    SkillEntryFileService,
    CreateAssetHandler,
    SaveAssetVersionHandler,
    SetAssetStatusHandler,
    GetAssetVersionHandler,
    GetEntryFileTextHandler,
    GetImageContentHandler,
    ListAssetVersionsHandler,
    SearchAssetsHandler,
    FindAssetVersionsByContentHashHandler,
  ],
  exports: [CatalogAssetResolver],
})
export class CatalogModule {}
