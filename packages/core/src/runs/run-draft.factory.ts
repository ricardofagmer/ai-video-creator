import { type AssetRef } from '@studio/shared/catalog';
import { type Brief, type Recipe } from '@studio/shared/recipes';
import {
  emptyTotals,
  pendingSteps,
  resolveLimits,
  stagePhase,
  type CorrelationId,
  type RunComparisonLink,
  type RunCreatedBy,
  type RunFile,
  type RunId,
  type RunRecipe,
  type RunScheduleLink,
  type RunStatus,
  type StageRecord,
} from '@studio/shared/run-format';
import { InvalidRunInputError } from './runs.errors';

/**
 * The two statuses a run may be created in: `draft` by the api or CLI, `pending` by the watcher from
 * a due schedule slot (SPEC 0006 section 4.6). Every later status is written by the state machine.
 */
export type DraftRunInitialStatus = Extract<RunStatus, 'draft' | 'pending'>;

export interface DraftRunFacts {
  runId: RunId;
  title: string;
  createdBy: RunCreatedBy;
  correlationId: CorrelationId | null;
  /** The resolved recipe version: ref, `contentHash` pin and the full definition, frozen in the run. */
  recipe: RunRecipe;
  brief: Brief;
  references: readonly AssetRef[];
  /** SPEC 0003 section 5.3: set on both arms of an A/B comparison only. */
  comparison: RunComparisonLink | null;
  /** SPEC 0006 section 4.3: set exactly when `createdBy` is `watcher`; absent otherwise. */
  schedule?: RunScheduleLink | null;
  /** Defaults to `draft`; the watcher creates a scheduled run at `pending` (SPEC 0006 Q4). */
  initialStatus?: DraftRunInitialStatus;
  now: Date;
}

/**
 * C3 rule: `schedule` is present exactly when `createdBy` is `watcher`. Checked before the run is
 * built so a caller that drops the link fails here, typed, instead of at the run.json write.
 */
function assertScheduleOrigin(facts: DraftRunFacts): RunScheduleLink | null {
  const schedule = facts.schedule ?? null;
  if ((facts.createdBy === 'watcher') !== (schedule !== null)) {
    throw new InvalidRunInputError([{ path: 'schedule', message: 'schedule is present exactly when createdBy is watcher' }]);
  }
  return schedule;
}

function initialState(status: DraftRunInitialStatus, since: string): RunFile['state'] {
  return status === 'pending' ? { status: 'pending', since } : { status: 'draft', since };
}

/**
 * Every stage of the recipe graph in canonical order, all `pending` with the seven fixed steps.
 * Stages the recipe switches off stay listed; the engine marks them `skipped` when it starts.
 */
function draftStages(recipe: Recipe): StageRecord[] {
  return recipe.graph.stages.map(
    (stage, index): StageRecord => ({
      number: index + 1,
      stageId: stage.stageId,
      phaseId: stagePhase[stage.stageId],
      outcome: { status: 'pending' },
      steps: pendingSteps(),
      outputs: [],
      estimate: null,
      durationMs: 0,
      costUsd: 0,
    }),
  );
}

/**
 * A new run.json (ADR 0003 "Who writes what"): `draft` when the api or CLI creates it before any
 * watcher runs, or `pending` with its `schedule` link when the watcher creates it from a due slot
 * (SPEC 0006 section 5.6). The recipe is frozen whole, so its bindings pin every `assetId@version`
 * with its `contentHash`; limits are the defaults with the recipe's overrides (C3
 * `resolveLimits`). Each arm of a comparison keeps its own per-run ceiling (SPEC 0003 Q2).
 */
export function buildDraftRun(facts: DraftRunFacts): RunFile {
  const schedule = assertScheduleOrigin(facts);
  const timestamp = facts.now.toISOString();
  const run: RunFile = {
    format: 1,
    runId: facts.runId,
    title: facts.title,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: facts.createdBy,
    correlationId: facts.correlationId,
    state: initialState(facts.initialStatus ?? 'draft', timestamp),
    recipe: facts.recipe,
    brief: facts.brief,
    references: [...facts.references],
    limits: resolveLimits(facts.recipe.definition.limits),
    plan: null,
    stages: draftStages(facts.recipe.definition),
    cursor: null,
    totals: { ...emptyTotals, costByProvider: { ...emptyTotals.costByProvider } },
    lastExecution: null,
  };
  // Absent, not null, on an ordinary run: every rev 4 run folder keeps validating (C3).
  if (facts.comparison !== null) run.comparison = facts.comparison;
  if (schedule !== null) run.schedule = schedule;
  return run;
}
