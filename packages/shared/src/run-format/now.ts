import { z } from 'zod';
import { EpochMsSchema, RunIdSchema, SessionIdSchema } from '../common/ids';
import { ModelIdSchema, ModelRoleSchema, SessionOutcomeSchema, StageIdSchema, StepNameSchema } from './vocabulary';

/** At most this many recent activities are kept in now.json (eng-grafo `atividades`). */
export const NOW_ACTIVITY_LIMIT = 50;

export const ActivitySchema = z
  .object({
    atMs: EpochMsSchema,
    kind: z.enum(['tool', 'text', 'command', 'check']),
    /** Redacted, single line, no secrets or biometric paths. */
    text: z.string().max(500),
  })
  .strict();
export type Activity = z.infer<typeof ActivitySchema>;

const sessionSummaryShape = {
  sessionId: SessionIdSchema,
  role: ModelRoleSchema,
  modelId: ModelIdSchema,
  step: StepNameSchema,
  attempt: z.number().int().min(1),
  startedAtMs: EpochMsSchema,
};

/** A finished agent session of the current stage. */
export const NowSessionSchema = z
  .object({
    ...sessionSummaryShape,
    endedAtMs: EpochMsSchema,
    outcome: SessionOutcomeSchema,
    costUsd: z.number().nonnegative(),
    durationMs: z.number().int().nonnegative(),
  })
  .strict();
export type NowSession = z.infer<typeof NowSessionSchema>;

/**
 * `runs/<runId>/now.json`: live snapshot rewritten by the watcher on every event, at most about
 * four times a second. Read by web (through the api) and CLI to draw the timeline.
 */
export const NowFileSchema = z
  .object({
    runId: RunIdSchema,
    pid: z.number().int().positive(),
    updatedAtMs: EpochMsSchema,
    stageNumber: z.number().int().min(1).max(99),
    stageId: StageIdSchema,
    step: StepNameSchema,
    attempt: z.number().int().min(1),
    stepSinceMs: EpochMsSchema,
    activities: z.array(ActivitySchema).max(NOW_ACTIVITY_LIMIT),
    sessions: z.array(NowSessionSchema).max(200),
    currentSession: z.object(sessionSummaryShape).strict().nullable(),
    /** e.g. "brief da etapa 5 em preparo" while the next stage's brief renders in parallel. */
    parallel: z.string().max(200).nullable(),
    /** pt-BR notice for the owner, e.g. a degraded Reviewer. */
    notice: z.string().max(500).nullable(),
  })
  .strict();
export type NowFile = z.infer<typeof NowFileSchema>;
