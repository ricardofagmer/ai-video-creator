import { z } from 'zod';
import { CorrelationIdSchema, IsoDateTimeSchema, RunIdSchema, Sha256Schema } from '../common/ids';
import { AssetRefSchema } from '../catalog/asset-kind';
import { BriefSchema } from '../recipes/brief';
import { RecipeRefSchema, RecipeSchema } from '../recipes/recipe';
import { RunComparisonLinkSchema } from './comparison';
import { LimitsSchema } from './limits';
import { RunStateSchema } from './run-state';
import { RunScheduleLinkSchema } from './schedule-link';
import { StageRecordSchema } from './stage-record';
import { RunStatusSchema, StageIdSchema, StepNameSchema } from './vocabulary';

/** The recipe version a run uses, frozen into run.json so the folder is a complete audit record. */
export const RunRecipeSchema = z
  .object({
    ref: RecipeRefSchema,
    contentHash: Sha256Schema,
    definition: RecipeSchema,
  })
  .strict();
export type RunRecipe = z.infer<typeof RunRecipeSchema>;

/** The plan the `plan` stage recorded (topology PlanOutput, or the recipe default on Planner failure). */
export const RunPlanSchema = z
  .object({
    source: z.enum(['planner', 'recipe-default']),
    totalEstimateUsd: z.number().nonnegative(),
    risks: z.array(z.string().max(300)).max(10),
    questionsForOwner: z.array(z.string().max(300)).max(5),
    /** pt-BR warning shown when the default plan replaced a failed Planner (topology section 9). */
    warning: z.string().max(500).nullable(),
    recordedAt: IsoDateTimeSchema,
  })
  .strict();
export type RunPlan = z.infer<typeof RunPlanSchema>;

/** Exact position to resume from (eng-grafo `iteracao.passoAtual`). */
export const RunCursorSchema = z
  .object({
    stageNumber: z.number().int().min(1).max(99),
    stageId: StageIdSchema,
    step: StepNameSchema,
    attempt: z.number().int().min(1),
  })
  .strict();
export type RunCursor = z.infer<typeof RunCursorSchema>;

/** Run totals (PRD concept map `totals`); USD split by provider family. */
export const TotalsSchema = z
  .object({
    durationMs: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative(),
    costByProvider: z
      .object({
        claude: z.number().nonnegative(),
        tts: z.number().nonnegative(),
        render: z.number().nonnegative(),
      })
      .strict(),
    executions: z.number().int().nonnegative(),
    stagesDelivered: z.number().int().nonnegative(),
    sessions: z.number().int().nonnegative(),
    checksRun: z.number().int().nonnegative(),
    recoveries: z.number().int().nonnegative(),
    recoveriesResolved: z.number().int().nonnegative(),
    failures: z.number().int().nonnegative(),
  })
  .strict();
export type Totals = z.infer<typeof TotalsSchema>;

export const emptyTotals: Readonly<Totals> = {
  durationMs: 0,
  costUsd: 0,
  costByProvider: { claude: 0, tts: 0, render: 0 },
  executions: 0,
  stagesDelivered: 0,
  sessions: 0,
  checksRun: 0,
  recoveries: 0,
  recoveriesResolved: 0,
  failures: 0,
};

/** The latest watcher execution of this run (eng-grafo `ultimaExecucao`). */
export const LastExecutionSchema = z
  .object({
    pid: z.number().int().positive(),
    startedAt: IsoDateTimeSchema,
    endedAt: IsoDateTimeSchema.nullable(),
    /** Status the execution ended in; null while it runs. */
    outcome: RunStatusSchema.nullable(),
  })
  .strict();
export type LastExecution = z.infer<typeof LastExecutionSchema>;

/**
 * Who created a run. SPEC 0006 (L2) adds `watcher`: a run the watcher created at `pending` from a
 * due schedule slot. Additive, so `format` stays 1 and every rev 4 run folder still validates.
 */
export const RunCreatedBySchema = z.enum(['api', 'cli', 'watcher']);
export type RunCreatedBy = z.infer<typeof RunCreatedBySchema>;

/**
 * `runs/<runId>/run.json`, the source of truth for run state (ADR 0003 decision 3).
 * The api or CLI creates it as `draft` and moves it to `pending`; the watcher owns it while its
 * pid lives; the api or CLI writes the `review` -> `approved` / `rejected` decision. SPEC 0006
 * section 4.6: the watcher also creates a run directly at `pending` from a due slot of an `active`
 * schedule (`createdBy: 'watcher'` with `schedule`), one write, then the ordinary rules apply.
 * Rule: `schedule` is present exactly when `createdBy` is `watcher`.
 */
export const RunFileSchema = z
  .object({
    format: z.literal(1),
    runId: RunIdSchema,
    title: z.string().min(1).max(200),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    createdBy: RunCreatedBySchema,
    correlationId: CorrelationIdSchema.nullable(),
    state: RunStateSchema,
    recipe: RunRecipeSchema,
    brief: BriefSchema,
    /** Run-specific references attached to the brief (PRD 6 step 2). */
    references: z.array(AssetRefSchema).max(50),
    limits: LimitsSchema,
    plan: RunPlanSchema.nullable(),
    stages: z.array(StageRecordSchema).min(1).max(99),
    /** Null before the first step and after the last stage is delivered. */
    cursor: RunCursorSchema.nullable(),
    totals: TotalsSchema,
    lastExecution: LastExecutionSchema.nullable(),
    /**
     * SPEC 0003 (R2): set by the api on both arms of an A/B comparison, absent on every ordinary
     * run, so every rev 4 run folder still validates and `format` stays 1. The watcher does not
     * read it except for `learningsCutoff` at step `brief`.
     */
    comparison: RunComparisonLinkSchema.optional(),
    /** SPEC 0006 (R3): the schedule slot that created the run; see `RunScheduleLinkSchema`. */
    schedule: RunScheduleLinkSchema.optional(),
  })
  .strict()
  .superRefine((run, context) => {
    run.stages.forEach((stage, index) => {
      if (stage.number !== index + 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['stages', index, 'number'],
          message: 'stages are numbered 1..N without gaps',
        });
      }
    });
    if (run.cursor !== null) {
      const target = run.stages[run.cursor.stageNumber - 1];
      if (target === undefined || target.stageId !== run.cursor.stageId) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['cursor'], message: 'cursor does not point at a stage' });
      }
    }
    if (run.recipe.ref !== `${run.recipe.definition.id}@${run.recipe.definition.version}`) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['recipe', 'ref'], message: 'ref does not match the definition' });
    }
    if ((run.createdBy === 'watcher') !== (run.schedule !== undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['schedule'],
        message: 'schedule is present exactly when createdBy is watcher',
      });
    }
  });
export type RunFile = z.infer<typeof RunFileSchema>;
