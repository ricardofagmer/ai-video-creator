import { z } from 'zod';
import { CurationIdSchema, IsoDateTimeSchema, SessionIdSchema } from '../common/ids';
import { CURATOR_ROLE, curationBounds } from './constants';
import { CurationCallOutcomeSchema, CurationCheckIdSchema, CurationReasonIdSchema, CurationStatusSchema } from './enums';
import { CurationUsageSchema } from './session';

/**
 * Curation event names (SPEC 0005 section 7). The first three are api log lines only; the other
 * six are lines of `curations/<id>/events.jsonl`, also copied to `logs/*.jsonl`.
 */
export const CurationEventTypeSchema = z.enum([
  'curation.requested',
  'curation.refused-request',
  'curation.decided',
  'curation.claimed',
  'curation.collected',
  'curation.call.started',
  'curation.call.ended',
  'curation.check',
  'curation.ended',
]);
export type CurationEventType = z.infer<typeof CurationEventTypeSchema>;

const checkIds = z.array(CurationCheckIdSchema).max(CurationCheckIdSchema.options.length);
const attempt = z.number().int().min(1).max(curationBounds.maxCalls);
const eventBase = { at: IsoDateTimeSchema, curationId: CurationIdSchema };

/**
 * One line of `curations/<curationId>/events.jsonl`, append-only, written only by the watcher.
 * Lines carry ids, reason ids, counts and amounts only: never body, note, focus, reason, summary,
 * diff, packet or output text (SPEC 0005 K7). Span nesting (curation > step > session > model call)
 * follows from `curationId`, `attempt` and `sessionId`.
 */
export const CurationEventSchema = z.discriminatedUnion('type', [
  z.object({ ...eventBase, type: z.literal('curation.claimed'), pid: z.number().int().positive() }).strict(),
  z
    .object({
      ...eventBase,
      type: z.literal('curation.collected'),
      counts: z
        .object({
          runs: z.number().int().min(0).max(curationBounds.maxRuns),
          notes: z.number().int().min(0).max(curationBounds.maxNotes),
          evidence: z.number().int().min(0).max(curationBounds.maxEvidence),
          declined: z.number().int().min(0).max(curationBounds.maxDeclined),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...eventBase,
      type: z.literal('curation.call.started'),
      sessionId: SessionIdSchema,
      attempt,
      role: z.literal(CURATOR_ROLE),
      modelId: z.string().max(100),
      instructionVersion: z.string().max(40),
    })
    .strict(),
  z
    .object({
      ...eventBase,
      type: z.literal('curation.call.ended'),
      sessionId: SessionIdSchema,
      attempt,
      outcome: CurationCallOutcomeSchema,
      tokens: CurationUsageSchema.nullable(),
      usd: z.number().nonnegative(),
      durationMs: z.number().int().nonnegative(),
    })
    .strict(),
  z.object({ ...eventBase, type: z.literal('curation.check'), attempt, passed: checkIds, failed: checkIds }).strict(),
  z
    .object({
      ...eventBase,
      type: z.literal('curation.ended'),
      status: CurationStatusSchema.exclude(['requested', 'collecting']),
      reasonId: CurationReasonIdSchema.nullable(),
      spentUsd: z.number().nonnegative(),
      durationMs: z.number().int().nonnegative(),
    })
    .strict(),
]);
export type CurationEvent = z.infer<typeof CurationEventSchema>;
