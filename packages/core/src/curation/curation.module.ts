import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AssetStoreModule } from '../asset-store/asset-store.module';
import { CatalogModule } from '../catalog/catalog.module';
import { ComparisonsModule } from '../comparisons/comparisons.module';
import { CostsModule } from '../costs/costs.module';
import { LearningsModule } from '../learnings/learnings.module';
import { PathsModule } from '../paths/paths.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RecipesModule } from '../recipes/recipes.module';
import { RedactionModule } from '../redaction/redaction.module';
import { DecideCurationHandler } from './commands/decide-curation.handler';
import { RequestCurationHandler } from './commands/request-curation.handler';
import { CurationCatalogReader } from './curation-catalog.reader';
import { CurationDecisionRepository } from './curation-decision.repository';
import { CurationEvidenceRepository } from './curation-evidence.repository';
import { CurationStore } from './curation-store';
import { CurationSubjectBodyReader } from './curation-subject-body.reader';
import { CurationSubjectSelector } from './curation-subject.selector';
import { CurationViewAssembler } from './curation-view.assembler';
import { GetCurationHandler } from './queries/get-curation.handler';
import { ListCurationsHandler } from './queries/list-curations.handler';

/**
 * Curations for the api (SPEC 0005 sections 5.1 and 5.7, C10 rev 4): request, decision, get and
 * list. The api is the only SQLite writer of `curation_decisions` and writes `curation.json` once,
 * at the request (C5-AC-11). Catalog, recipe and comparison writes happen only through their own
 * commands, on the owner's decision. The composition root registers `CqrsModule.forRoot()`; the
 * watcher imports `CurationReadModule` instead.
 */
@Module({
  imports: [
    CqrsModule,
    PathsModule,
    PrismaModule,
    AssetStoreModule,
    RedactionModule,
    LearningsModule,
    CatalogModule,
    RecipesModule,
    CostsModule,
    ComparisonsModule,
  ],
  providers: [
    CurationStore,
    CurationCatalogReader,
    CurationSubjectBodyReader,
    CurationEvidenceRepository,
    CurationDecisionRepository,
    CurationSubjectSelector,
    CurationViewAssembler,
    RequestCurationHandler,
    DecideCurationHandler,
    GetCurationHandler,
    ListCurationsHandler,
  ],
})
export class CurationModule {}
