import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PrismaModule } from '../prisma/prisma.module';
import { LearningNoteRepository } from './learning-note.repository';
import { LearningNotesReader } from './learning-notes.reader';
import { ListLearningNotesHandler } from './queries/list-learning-notes.handler';

/**
 * Read side of the learnings for processes that must never write SQLite: the watcher binds C6
 * `LearningNotesPort` to the exported `LearningNotesReader` (R2-07, ADR 0003). No command handler is
 * registered here. A root that imports `LearningsModule` must not import this one too, or the query
 * would have two handlers.
 */
@Module({
  imports: [CqrsModule, PrismaModule],
  providers: [LearningNoteRepository, LearningNotesReader, ListLearningNotesHandler],
  exports: [LearningNotesReader],
})
export class LearningsReadModule {}
