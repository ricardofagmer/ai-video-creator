import { Injectable, Logger } from '@nestjs/common';
import { type ScheduleFile } from '@studio/shared/schedules';
import { CostLedgerService } from '../costs/cost-ledger.service';
import { ScheduleRecipeReader } from './schedule-recipe.reader';
import { ScheduleRunsReader } from './schedule-runs.reader';
import { ScheduleStore } from './schedule-store';
import { selectBrief, type SlotGuardFacts, type SlotRecipeState } from './slot-decision';

export interface SlotFactsRequest {
  schedule: ScheduleFile;
  /** The evaluation instant; the month figure is read for this instant's local month (L9). */
  now: Date;
}

/**
 * Gathers the facts `decideSlot` needs for one schedule (SPEC 0006 section 5.6), reading only: the
 * slot log, the fired runs' `run.json`, the pinned recipe and its refs (Prisma reads), and the
 * month-to-date figure from `CostLedgerService.monthToDateUsd`, the read the run preflight and the
 * curation spend gate use. Nothing here writes a file or SQLite.
 */
@Injectable()
export class SlotFactsCollector {
  private readonly logger = new Logger(SlotFactsCollector.name);

  constructor(
    private readonly store: ScheduleStore,
    private readonly runs: ScheduleRunsReader,
    private readonly recipes: ScheduleRecipeReader,
    private readonly costs: CostLedgerService,
  ) {}

  async collect(request: SlotFactsRequest): Promise<SlotGuardFacts> {
    const { schedule, now } = request;
    const slots = await this.store.summarizeSlots(schedule.scheduleId, now);
    const { lastFiredRun, runsAtReview } = await this.runs.firedRunsState(slots.firedRunIds);
    const brief = selectBrief(schedule, slots.usedBriefIds);
    const version = await this.recipes.findVersion(schedule.recipeRef);
    let recipe: SlotRecipeState = { state: 'missing' };
    if (version !== null) {
      const unresolved = await this.recipes.unresolved({ bindings: version.recipe.bindings, references: brief?.references ?? [] });
      recipe = { state: 'found', version, refsResolvable: unresolved.bindings.length === 0 && unresolved.references.length === 0 };
    }
    return { lastFiredRun, runsAtReview, brief, monthToDateUsd: await this.monthToDateOrNull(schedule, now), recipe };
  }

  /** Fail closed: any error reading the month spend is "unknown", never zero (K11). */
  private async monthToDateOrNull(schedule: ScheduleFile, at: Date): Promise<number | null> {
    try {
      return await this.costs.monthToDateUsd(at);
    } catch (error) {
      this.logger.warn({
        event: 'schedule.month-spend-unavailable',
        scheduleId: schedule.scheduleId,
        errorName: error instanceof Error ? error.name : 'unknown',
      });
      return null;
    }
  }
}
