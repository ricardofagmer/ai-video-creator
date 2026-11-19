import { Inject, Injectable, Logger } from '@nestjs/common';
import { writeStageBrief } from '@studio/shared/run-files';
import { type StageLocation } from '@studio/shared/run-format';
import { type ActiveRun } from '../active-run';
import { type Clock } from '../clock';
import { CLOCK } from '../engine.tokens';
import { ExecutorRegistry } from '../executor-registry';
import { ownerTexts } from '../owner-texts';
import { nextPendingCursor } from '../run-mutations';
import { planningContextFor, recipeStageOf } from '../stage-workspace';
import { StageBriefComposer } from './stage-brief.composer';

export type DraftOutcome =
  | { kind: 'none' }
  | { kind: 'drafted'; location: StageLocation }
  | { kind: 'failed'; location: StageLocation; error: unknown };

/**
 * Drafts the next stage's `brief.json` while the current stage's `execute` runs (PRD 7.2 step 4,
 * topology section 2). The render is deterministic and calls no model (K1). The draft cannot see
 * the outputs the current stage has not recorded yet, so that stage's own `brief` step renders the
 * definitive brief over it; a failed draft is reported and never fails the running step. The draft
 * quotes the same learning notes as the definitive brief (same cutoff, SPEC 0003 R2-07); a failed
 * notes read is a failed draft, never a draft without notes.
 */
@Injectable()
export class NextBriefDrafter {
  private readonly logger = new Logger(NextBriefDrafter.name);

  constructor(
    @Inject(ExecutorRegistry) private readonly executors: ExecutorRegistry,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(StageBriefComposer) private readonly composer: StageBriefComposer,
  ) {}

  /** Never rejects: a failure is returned so `execute` keeps its own outcome. */
  async draftAfter(active: ActiveRun, current: StageLocation): Promise<DraftOutcome> {
    const next = nextPendingCursor(active.snapshot, current.stageNumber);
    if (next === null) return { kind: 'none' };
    const location: StageLocation = { stageNumber: next.stageNumber, stageId: next.stageId };
    if (active.stepRecord(location.stageNumber, 'brief').status !== 'pending') return { kind: 'none' };

    active.setParallel(ownerTexts.nextBriefDrafting(location.stageNumber, location.stageId));
    try {
      const run = active.snapshot;
      const recipeStage = recipeStageOf(run, location.stageId);
      const context = planningContextFor(run, location, recipeStage?.params ?? {});
      const brief = await this.composer.compose({
        run,
        location,
        recipeStage,
        declaredOutputs: this.executors.forStage(location.stageId).declaredOutputs(context),
        renderedAt: this.clock.now(),
      });
      await writeStageBrief(active.runDir, brief);
      return { kind: 'drafted', location };
    } catch (error) {
      return { kind: 'failed', location, error };
    } finally {
      active.setParallel(null);
    }
  }

  /** Only the error name reaches events.jsonl and the log; messages may carry paths. */
  async report(active: ActiveRun, outcome: DraftOutcome): Promise<void> {
    if (outcome.kind === 'none') return;
    const { stageNumber, stageId } = outcome.location;
    if (outcome.kind === 'drafted') {
      await active.emit({ type: 'log', level: 'info', text: ownerTexts.nextBriefDrafted(stageNumber, stageId), stepKey: null });
      return;
    }
    const errorName = outcome.error instanceof Error ? outcome.error.name : typeof outcome.error;
    this.logger.warn(`next brief draft for stage ${stageNumber} (${stageId}) failed: ${errorName}`);
    await active.emit({
      type: 'log',
      level: 'warning',
      text: ownerTexts.nextBriefDraftFailed(stageNumber, stageId, errorName),
      stepKey: null,
    });
  }
}
