import { Query } from '@nestjs/cqrs';
import { type AssetRef, type LearningNote } from '@studio/shared/catalog';
import { type BriefRefLearnings } from '../learning-brief-caps';

/**
 * - `version`: one version's notes, active and retired, newest first, at most 50 (the api's
 *   `AssetVersionView.learnings`);
 * - `brief`: the B18 cutoff rule for a run's refs: notes created at or before `cutoff` and not
 *   retired at or before it, capped at 10 per ref and 4,000 characters per brief.
 */
export type ListLearningNotesCriteria = { scope: 'version'; ref: string } | { scope: 'brief'; refs: readonly string[]; cutoff: string };

export type ListLearningNotesResult =
  | { scope: 'version'; ref: AssetRef; notes: LearningNote[] }
  | { scope: 'brief'; cutoff: string; entries: BriefRefLearnings[] };

/** Read-only (R2-04 check): its handler reaches only `findMany` reads. */
export class ListLearningNotesQuery extends Query<ListLearningNotesResult> {
  constructor(readonly criteria: ListLearningNotesCriteria) {
    super();
  }
}
