import { Inject, Injectable } from '@nestjs/common';
import { PlanOutputSchema, type PlanOutput } from '@studio/shared/agents';
import { RunFileError, readJsonFile, readStageBrief, resolveInsideRunReal, writeRunMarkdown } from '@studio/shared/run-files';
import { type ActiveRun } from '../active-run';
import { type StageBriefLearnings } from '../brief/learnings-section';
import { type Clock } from '../clock';
import { CLOCK } from '../engine.tokens';
import { ownerTexts } from '../owner-texts';
import { type GateVerdict } from './gate-keeper';
import { renderPlanMarkdown } from './plan-markdown';

/** Output name the `plan` stage records its `PlanOutput` under (C7 artifact id `plan`). */
const PLAN_OUTPUT_NAME = 'plan';

/** The `plan` stage brief's notes; `learnings: null` when that brief was rendered before R2. */
type PlanLearnings = { kind: 'read'; learnings: StageBriefLearnings | null } | { kind: 'unreadable' };

/**
 * After the `plan` stage is delivered, the engine reads the recorded `PlanOutput`, keeps its
 * summary in `run.plan` and exports `plan.md` with the learning notes of the `plan` stage brief. Questions for the owner hold the run in `waiting`
 * (topology section 12). The plan gate itself is checked by `GateKeeper` before the next stage.
 */
@Injectable()
export class PlanRecorder {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  async record(active: ActiveRun, stageNumber: number): Promise<GateVerdict> {
    const plan = await this.readPlan(active, stageNumber);
    if (plan === null) {
      await active.setState({ status: 'failed', since: this.clock.now().toISOString(), reason: ownerTexts.planMissing, stepKey: null });
      return { kind: 'held', status: 'failed' };
    }
    const planLearnings = await this.readPlanLearnings(active, stageNumber);
    if (planLearnings.kind === 'unreadable') {
      await active.setState({
        status: 'failed',
        since: this.clock.now().toISOString(),
        reason: ownerTexts.planLearningsUnavailable,
        stepKey: null,
      });
      return { kind: 'held', status: 'failed' };
    }
    const now = this.clock.now().toISOString();
    active.setPlan({
      source: 'planner',
      totalEstimateUsd: plan.totalEstimateUsd,
      risks: plan.risks,
      questionsForOwner: plan.questionsForOwner,
      warning: null,
      recordedAt: now,
    });
    await writeRunMarkdown(active.runDir, 'plan', renderPlanMarkdown(active.snapshot, plan, planLearnings.learnings));
    await active.persist();
    if (plan.questionsForOwner.length === 0) return { kind: 'open' };
    await active.setState({
      status: 'waiting',
      since: now,
      cause: { kind: 'planner-questions', questions: plan.questionsForOwner },
      reason: ownerTexts.plannerQuestionsReason,
      whatToDo: ownerTexts.plannerQuestionsWhatToDo,
    });
    return { kind: 'held', status: 'waiting' };
  }

  /**
   * SPEC 0003 section 5.5: plan.md lists the notes the `plan` stage brief quoted, read back from
   * that brief rather than from SQLite, so the plan shows exactly the list the stage was given.
   */
  private async readPlanLearnings(active: ActiveRun, stageNumber: number): Promise<PlanLearnings> {
    const location = { stageNumber, stageId: active.stage(stageNumber).stageId };
    try {
      const brief = await readStageBrief(active.runDir, location);
      return { kind: 'read', learnings: brief.learnings ?? null };
    } catch (error) {
      if (error instanceof RunFileError) return { kind: 'unreadable' };
      throw error;
    }
  }

  /** Null when the output is missing, invalid or carries a negative estimate. */
  private async readPlan(active: ActiveRun, stageNumber: number): Promise<PlanOutput | null> {
    const output = active.stage(stageNumber).outputs.find((candidate) => candidate.name === PLAN_OUTPUT_NAME);
    if (output === undefined) return null;
    try {
      const plan = await readJsonFile(await resolveInsideRunReal(active.runDir, output.path), PlanOutputSchema);
      return plan.totalEstimateUsd >= 0 ? plan : null;
    } catch (error) {
      if (error instanceof RunFileError) return null;
      throw error;
    }
  }
}
