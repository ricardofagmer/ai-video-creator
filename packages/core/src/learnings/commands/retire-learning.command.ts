import { Command } from '@nestjs/cqrs';
import { type LearningWriteResult } from './save-learning-from-run.command';

export interface RetireLearningInput {
  /** The version in the path: a note is retired only through the version it belongs to. */
  ref: string;
  noteId: string;
}

/** Active to retired, once (section 5.5); nothing is deleted. A retired note leaves later briefs. */
export class RetireLearningCommand extends Command<LearningWriteResult> {
  constructor(readonly input: RetireLearningInput) {
    super();
  }
}
