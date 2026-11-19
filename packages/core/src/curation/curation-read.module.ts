import { Module } from '@nestjs/common';
import { AssetStoreModule } from '../asset-store/asset-store.module';
import { LearningsReadModule } from '../learnings/learnings-read.module';
import { PathsModule } from '../paths/paths.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedactionModule } from '../redaction/redaction.module';
import { CurationCatalogReader } from './curation-catalog.reader';
import { CurationDecisionRepository } from './curation-decision.repository';
import { CurationEvidenceCollector } from './curation-evidence.collector';
import { CurationEvidenceRepository } from './curation-evidence.repository';
import { CurationStore } from './curation-store';
import { CurationSubjectBodyReader } from './curation-subject-body.reader';
import { CurationSubjectSelector } from './curation-subject.selector';
import { CurationGroundCheckLookups } from './ground-check';

/**
 * Read side of the curation module for the watcher (SPEC 0005 section 5.2, ADR 0003): the store
 * over `curations/`, the subject selector, the read-only evidence collector and the SQLite lookups
 * of the ground check. It registers no command or query handler, and nothing it provides writes
 * SQLite or the catalog; the watcher writes only `curations/<id>/` through the shared file helpers.
 * The api imports `CurationModule` instead; never import both in one root (`LearningsReadModule`
 * and `LearningsModule` would both register their query handler).
 */
@Module({
  imports: [PathsModule, PrismaModule, AssetStoreModule, RedactionModule, LearningsReadModule],
  providers: [
    CurationStore,
    CurationCatalogReader,
    CurationSubjectBodyReader,
    CurationEvidenceRepository,
    CurationDecisionRepository,
    CurationSubjectSelector,
    CurationEvidenceCollector,
    CurationGroundCheckLookups,
  ],
  exports: [CurationStore, CurationSubjectSelector, CurationEvidenceCollector, CurationGroundCheckLookups],
})
export class CurationReadModule {}
