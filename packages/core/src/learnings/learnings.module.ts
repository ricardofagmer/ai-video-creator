import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AssetVersionRepository } from '../catalog/asset-version.repository';
import { PathsModule } from '../paths/paths.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedactionModule } from '../redaction/redaction.module';
import { ReviewRunAccess } from '../review/review-run-access';
import { RunLocks } from '../review/run-locks';
import { RetireLearningHandler } from './commands/retire-learning.handler';
import { SaveLearningFromRunHandler } from './commands/save-learning-from-run.handler';
import { LearningNoteRepository } from './learning-note.repository';
import { LearningNotesReader } from './learning-notes.reader';
import { ListLearningNotesHandler } from './queries/list-learning-notes.handler';

/**
 * Learnings write-back (SPEC 0003 section 5.5, criterion 36), for the api only: save a note from a
 * reviewed run, retire it, list them. Saving or retiring returns `reindexRef`; the api calls the
 * embeddings indexer with it (R2-AC-11), so this module never imports the embeddings module. The
 * watcher imports `LearningsReadModule` instead.
 */
@Module({
  imports: [CqrsModule, PrismaModule, PathsModule, RedactionModule],
  providers: [
    AssetVersionRepository,
    LearningNoteRepository,
    LearningNotesReader,
    ReviewRunAccess,
    RunLocks,
    SaveLearningFromRunHandler,
    RetireLearningHandler,
    ListLearningNotesHandler,
  ],
  exports: [LearningNotesReader],
})
export class LearningsModule {}
