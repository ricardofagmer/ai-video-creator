import { Command } from '@nestjs/cqrs';
import { type AssetRef, type LearningNote } from '@studio/shared/catalog';

export interface SaveLearningFromRunInput {
  /** The run in the path (`POST /runs/:runId/learnings`). */
  runId: string;
  /** C1 `AssetRef` the run used. */
  ref: string;
  /** Untrusted; normalized with `normalizeLearningText`, then 1..500 characters. Never logged. */
  text: string;
  /** The session's owner; never taken from a request body. */
  createdBy: string;
}

export interface LearningWriteResult {
  note: LearningNote;
  /**
   * The version whose search document changed (R2-AC-11). The api hands it to the embeddings
   * indexer; this module does not import the embeddings module.
   */
  reindexRef: AssetRef;
}

/**
 * A learning from a reviewed run becomes a note on an asset version the run used (SPEC 0003
 * section 5.5, PRD 8 step 6, B17). A row beside the immutable version: no new version, no
 * `contentHash` change.
 */
export class SaveLearningFromRunCommand extends Command<LearningWriteResult> {
  constructor(readonly input: SaveLearningFromRunInput) {
    super();
  }
}
