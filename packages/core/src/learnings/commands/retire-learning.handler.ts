import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { z } from 'zod';
import { AssetRefSchema, LearningNoteIdSchema, type LearningNote } from '@studio/shared/catalog';
import { PrismaService } from '../../prisma/prisma.service';
import { parseLearningInput } from '../learning-input';
import { toLearningNote } from '../learning-note.mapper';
import { LearningNoteRepository } from '../learning-note.repository';
import { LearningAlreadyRetiredError, LearningNoteNotFoundError } from '../learnings.errors';
import { RetireLearningCommand } from './retire-learning.command';
import { type LearningWriteResult } from './save-learning-from-run.command';

const RetireLearningInputSchema = z.object({ ref: AssetRefSchema, noteId: LearningNoteIdSchema }).strict();

/**
 * Retires one note through the version it belongs to (section 6 object-level check): a note id
 * under another version's path is answered as not found. The update matches `status = 'active'`
 * only, so of two concurrent retires exactly one succeeds.
 */
@CommandHandler(RetireLearningCommand)
export class RetireLearningHandler implements ICommandHandler<RetireLearningCommand, LearningWriteResult> {
  private readonly logger = new Logger(RetireLearningHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notes: LearningNoteRepository,
  ) {}

  async execute(command: RetireLearningCommand): Promise<LearningWriteResult> {
    const input = parseLearningInput(RetireLearningInputSchema, command.input);

    const note = await this.prisma.$transaction(async (transaction): Promise<LearningNote> => {
      const row = await this.notes.findById(input.noteId, transaction);
      if (row === null) throw new LearningNoteNotFoundError(input.ref, input.noteId);
      const current = toLearningNote(row);
      if (current.ref !== input.ref) throw new LearningNoteNotFoundError(input.ref, input.noteId);
      if (current.status === 'retired') throw new LearningAlreadyRetiredError(input.noteId);
      const retired = await this.notes.retire(input.noteId, new Date(), transaction);
      if (retired === 0) throw new LearningAlreadyRetiredError(input.noteId);
      const updated = await this.notes.findById(input.noteId, transaction);
      if (updated === null) throw new LearningNoteNotFoundError(input.ref, input.noteId);
      return toLearningNote(updated);
    });

    this.logger.log({ event: 'learnings.retired', noteId: note.noteId, ref: note.ref, runId: note.sourceRunId });
    return { note, reindexRef: note.ref };
  }
}
