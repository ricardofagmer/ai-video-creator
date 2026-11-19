import { z } from 'zod';
import { IsoDateTimeSchema, RelativePathSchema, SessionIdSchema, Sha256Schema } from '../common/ids';
import {
  OutputNameSchema,
  PhaseIdSchema,
  StageIdSchema,
  StepNameSchema,
  StepStatusSchema,
  stagePhase,
  stepOrder,
} from './vocabulary';

/**
 * One Recovery call on a failed step (PRD 7.3, topology RecoveryAction). `actionKind` holds a
 * value of the C7 `RecoveryAction` allowlist; the engine, not the agent, applied it.
 */
export const RecoveryRecordSchema = z
  .object({
    number: z.number().int().min(1),
    sessionId: SessionIdSchema.nullable(),
    attempt: z.number().int().min(1),
    /** Redacted first lines of the error. */
    error: z.string().max(2000),
    cause: z.string().max(500),
    whatWasDone: z.string().max(500),
    actionKind: z.string().regex(/^[a-z][a-z-]{1,39}$/),
    resolved: z.boolean(),
    needsPerson: z.boolean(),
    costUsd: z.number().nonnegative(),
    at: IsoDateTimeSchema,
  })
  .strict();
export type RecoveryRecord = z.infer<typeof RecoveryRecordSchema>;

/** One of the seven fixed steps of a stage (PRD 7.2). */
export const StepRecordSchema = z
  .object({
    step: StepNameSchema,
    status: StepStatusSchema,
    attempts: z.number().int().min(0),
    startedAt: IsoDateTimeSchema.nullable(),
    endedAt: IsoDateTimeSchema.nullable(),
    durationMs: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative(),
    /** Short engine summary, e.g. the failed postcondition or "recovered". */
    detail: z.string().max(500),
    recoveries: z.array(RecoveryRecordSchema).max(20),
  })
  .strict();
export type StepRecord = z.infer<typeof StepRecordSchema>;

/** A file the `record` step hashed into run.json (ADR 0003 decision 4). */
export const StageOutputSchema = z
  .object({
    name: OutputNameSchema,
    path: RelativePathSchema,
    contentHash: Sha256Schema,
    sizeBytes: z.number().int().nonnegative(),
    recordedAt: IsoDateTimeSchema,
  })
  .strict();
export type StageOutput = z.infer<typeof StageOutputSchema>;

/** Plan estimate for one stage (topology PlanOutput). */
export const StageEstimateSchema = z
  .object({
    tokens: z.number().int().nonnegative(),
    ttsChars: z.number().int().nonnegative(),
    renderSec: z.number().nonnegative(),
    usd: z.number().nonnegative(),
  })
  .strict();
export type StageEstimate = z.infer<typeof StageEstimateSchema>;

/** Stage progress; the step in progress is the run's `cursor`, not a stage status. */
export const StageOutcomeSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending') }).strict(),
  z
    .object({
      status: z.literal('delivered'),
      deliveredAt: IsoDateTimeSchema,
      summary: z.string().max(500),
    })
    .strict(),
  z.object({ status: z.literal('skipped'), reason: z.enum(['disabled-by-recipe', 'disabled-by-plan']) }).strict(),
]);
export type StageOutcome = z.infer<typeof StageOutcomeSchema>;

/** One stage of the run; stages are numbered 1..N continuously across phases. */
export const StageRecordSchema = z
  .object({
    number: z.number().int().min(1).max(99),
    stageId: StageIdSchema,
    phaseId: PhaseIdSchema,
    outcome: StageOutcomeSchema,
    /** Exactly the seven fixed steps, in PRD 7.2 order (criterion 10). */
    steps: z.array(StepRecordSchema).length(stepOrder.length),
    outputs: z.array(StageOutputSchema).max(200),
    estimate: StageEstimateSchema.nullable(),
    durationMs: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative(),
  })
  .strict()
  .superRefine((stage, context) => {
    stage.steps.forEach((record, index) => {
      if (record.step !== stepOrder[index]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['steps', index, 'step'],
          message: `step ${index + 1} must be ${stepOrder[index] ?? 'none'}`,
        });
      }
    });
    if (stage.phaseId !== stagePhase[stage.stageId]) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['phaseId'], message: 'phase does not match the stage' });
    }
    const settled = new Set(['ok', 'warning', 'skipped']);
    if (stage.outcome.status === 'delivered' && stage.steps.some((record) => !settled.has(record.status))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['outcome'],
        message: 'a delivered stage has every step ok, warning or skipped',
      });
    }
  });
export type StageRecord = z.infer<typeof StageRecordSchema>;

/** The seven step records of a stage before it starts. */
export function pendingSteps(): StepRecord[] {
  return stepOrder.map((step): StepRecord => ({
    step,
    status: 'pending',
    attempts: 0,
    startedAt: null,
    endedAt: null,
    durationMs: 0,
    costUsd: 0,
    detail: '',
    recoveries: [],
  }));
}
