import { Inject, Injectable } from '@nestjs/common';
import { type LearningNotesPort } from '@studio/shared/ports';
import { type RunFile, type StageBrief, type StageLocation } from '@studio/shared/run-format';
import { LearningNotesUnavailableError } from '../engine.errors';
import { LEARNING_NOTES } from '../engine.tokens';
import { learningRefs, learningsCutoff, selectBriefLearnings } from './brief-learnings';
import { type StageBriefLearnings } from './learnings-section';
import { renderStageBrief, type StageBriefRenderInput } from './stage-brief.renderer';

export type StageBriefComposeInput = Omit<StageBriefRenderInput, 'learnings'>;

/**
 * Reads the learning notes a stage brief quotes, then renders the brief (SPEC 0003 section 5.5).
 * The read is the C6 `LearningNotesPort`, bound to the core read query: the watcher reads SQLite
 * and writes nothing (ADR 0003). A failed read rejects with `LearningNotesUnavailableError`, so no
 * caller can write a brief that silently lacks its notes. The callers report the failure by error
 * class name only; note text never reaches a log, an event or a step detail.
 */
@Injectable()
export class StageBriefComposer {
  constructor(@Inject(LEARNING_NOTES) private readonly learningNotes: LearningNotesPort) {}

  async compose(input: StageBriefComposeInput): Promise<StageBrief> {
    const learnings = await this.readLearnings(input.run, input.location);
    return renderStageBrief({ ...input, learnings });
  }

  private async readLearnings(run: Readonly<RunFile>, location: StageLocation): Promise<StageBriefLearnings> {
    const refs = learningRefs(run);
    if (refs.length === 0) return [];
    const cutoff = learningsCutoff(run);
    const read = await this.learningNotes
      .activeNotesFor(
        refs.map(({ ref }) => ref),
        cutoff,
      )
      .catch((error: unknown): never => {
        throw new LearningNotesUnavailableError(run.runId, location.stageNumber, { cause: error });
      });
    return selectBriefLearnings({ refs, read, cutoff });
  }
}
