import { z } from 'zod';
import { CorrelationIdSchema, EpochMsSchema, RunIdSchema, SessionIdSchema } from '../common/ids';
import { StepKeySchema } from './step-key';
import {
  CheckIdSchema,
  GateIdSchema,
  ModelIdSchema,
  ModelRoleSchema,
  ReviewSubjectSchema,
  RunStatusSchema,
  SessionOutcomeSchema,
  StepStatusSchema,
} from './vocabulary';

/** Display level of an event (eng-grafo `nivel`). */
export const EventLevelSchema = z.enum(['info', 'ok', 'warning', 'error', 'step', 'agent', 'command', 'output']);
export type EventLevel = z.infer<typeof EventLevelSchema>;

const eventBase = {
  atMs: EpochMsSchema,
  runId: RunIdSchema,
  level: EventLevelSchema,
  /** Human-readable line, redacted; pt-BR when it is meant for the owner. */
  text: z.string().max(2000),
  stepKey: StepKeySchema.nullable(),
  correlationId: CorrelationIdSchema.nullable(),
};

/**
 * One line of `runs/<runId>/events.jsonl`, append-only, written only by the watcher (ADR 0003).
 * `control.request` and `gate.answered` record requests and decisions the watcher read from
 * `control.json` and `approval.json`. Discriminated by `type`.
 */
export const RunEventSchema = z.discriminatedUnion('type', [
  z.object({ ...eventBase, type: z.literal('log') }).strict(),
  z
    .object({
      ...eventBase,
      type: z.literal('run.status'),
      from: RunStatusSchema.nullable(),
      to: RunStatusSchema,
    })
    .strict(),
  z.object({ ...eventBase, type: z.literal('step.status'), status: StepStatusSchema }).strict(),
  z
    .object({
      ...eventBase,
      type: z.literal('step.recovery'),
      actionKind: z.string().regex(/^[a-z][a-z-]{1,39}$/),
      resolved: z.boolean(),
      needsPerson: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...eventBase,
      type: z.literal('check.result'),
      checkId: CheckIdSchema,
      outcome: z.enum(['passed', 'failed', 'error', 'skipped']),
    })
    .strict(),
  z
    .object({
      ...eventBase,
      type: z.literal('session.started'),
      sessionId: SessionIdSchema,
      role: ModelRoleSchema,
      modelId: ModelIdSchema,
    })
    .strict(),
  z
    .object({
      ...eventBase,
      type: z.literal('session.ended'),
      sessionId: SessionIdSchema,
      role: ModelRoleSchema,
      modelId: ModelIdSchema,
      outcome: SessionOutcomeSchema,
      costUsd: z.number().nonnegative(),
    })
    .strict(),
  /** Topology section 10: every review emits scores, criterion ids and the retry flag. */
  z
    .object({
      ...eventBase,
      type: z.literal('review.verdict'),
      subject: ReviewSubjectSchema,
      scores: z.array(z.object({ criterionId: z.string().max(64), score: z.number().int().min(1).max(5) }).strict()).max(20),
      overall: z.number().min(1).max(5),
      retryRecommended: z.boolean(),
    })
    .strict(),
  z.object({ ...eventBase, type: z.literal('gate.waiting'), gate: GateIdSchema }).strict(),
  z
    .object({
      ...eventBase,
      type: z.literal('gate.answered'),
      gate: GateIdSchema,
      outcome: z.enum(['approved', 'rejected']),
    })
    .strict(),
  z
    .object({ ...eventBase, type: z.literal('control.request'), request: z.enum(['pause', 'stop', 'resume']) })
    .strict(),
]);
export type RunEvent = z.infer<typeof RunEventSchema>;
export type RunEventType = RunEvent['type'];
