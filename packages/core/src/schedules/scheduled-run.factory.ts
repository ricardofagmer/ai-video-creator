import { Injectable } from '@nestjs/common';
import { type RunFile, type RunId } from '@studio/shared/run-format';
import { type ScheduleBrief, type ScheduleFile } from '@studio/shared/schedules';
import { type RecipeVersionView } from '../recipes/recipe-version.mapper';
import { buildDraftRun } from '../runs/run-draft.factory';

/** The C3 run title limit, as `RunDraftService.create` cuts the brief topic. */
const RUN_TITLE_CHARS = 200;

export interface ScheduledRunFacts {
  schedule: Pick<ScheduleFile, 'scheduleId'>;
  slotAt: Date;
  /** `decideSlot`'s `fire` answer: the brief and the pinned recipe version it checked. */
  brief: ScheduleBrief;
  recipe: RecipeVersionView;
  /** Decided once per slot by the watcher (a run found for the slot after a crash keeps its id). */
  runId: RunId;
  now: Date;
}

/**
 * The run a fired slot creates (SPEC 0006 section 5.6 "fire"), through the same pure factory the api
 * uses. Always status `pending` (Q4: it waits at the plan gate like every run), `createdBy:
 * 'watcher'`, `correlationId: null` and the `schedule` link. It builds the run only; the watcher
 * writes it once through C5.
 */
@Injectable()
export class ScheduledRunFactory {
  build(facts: ScheduledRunFacts): RunFile {
    const { brief, recipe } = facts;
    return buildDraftRun({
      runId: facts.runId,
      title: brief.title ?? brief.brief.topic.slice(0, RUN_TITLE_CHARS),
      createdBy: 'watcher',
      correlationId: null,
      recipe: { ref: recipe.ref, contentHash: recipe.contentHash, definition: recipe.recipe },
      brief: brief.brief,
      references: brief.references,
      comparison: null,
      schedule: { scheduleId: facts.schedule.scheduleId, slotAt: facts.slotAt.toISOString(), briefId: brief.briefId },
      initialStatus: 'pending',
      now: facts.now,
    });
  }
}
