import { z } from 'zod';
import { IsoDateTimeSchema, RunIdSchema, SessionIdSchema } from '../common/ids';
import { StepKeySchema } from './step-key';
import { ModelIdSchema, ModelRoleSchema, SessionOutcomeSchema } from './vocabulary';

const tokenCount = z.number().int().nonnegative();
const usd = z.number().nonnegative();

/**
 * One billed unit of work. `model` entries follow topology section 10: every billed model call,
 * schema-feedback and billed rate-limit retries included, is one entry; `callIndex` separates the
 * calls of one session. Cache counts are null when the provider does not report them (ADR 0002).
 */
export const CostSessionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('model'),
      sessionId: SessionIdSchema,
      callIndex: z.number().int().min(1),
      stepKey: StepKeySchema,
      role: ModelRoleSchema,
      provider: z.literal('claude'),
      modelId: ModelIdSchema,
      inputTokens: tokenCount,
      outputTokens: tokenCount,
      cacheReadTokens: tokenCount.nullable(),
      cacheWriteTokens: tokenCount.nullable(),
      usd,
      outcome: SessionOutcomeSchema,
      startedAt: IsoDateTimeSchema,
      endedAt: IsoDateTimeSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('tts'),
      sessionId: SessionIdSchema,
      stepKey: StepKeySchema,
      provider: z.enum(['elevenlabs', 'local-voice']),
      characters: z.number().int().nonnegative(),
      usd,
      at: IsoDateTimeSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('render'),
      sessionId: SessionIdSchema,
      stepKey: StepKeySchema,
      provider: z.literal('render'),
      renderSeconds: z.number().nonnegative(),
      usd,
      at: IsoDateTimeSchema,
    })
    .strict(),
]);
export type CostSession = z.infer<typeof CostSessionSchema>;

/** Tolerance for the floating-point sum check; prices are well above a millionth of a dollar. */
export const COST_SUM_TOLERANCE_USD = 1e-6;

export function sumSessionUsd(sessions: readonly CostSession[]): number {
  return sessions.reduce((total, session) => total + session.usd, 0);
}

/**
 * `runs/<runId>/cost.json` (PRD 7.4, criterion 19). Written by the watcher through the cost
 * ledger. `totalUsd` equals the sum of `sessions[].usd`; a file that breaks this does not parse.
 */
export const CostFileSchema = z
  .object({
    format: z.literal(1),
    runId: RunIdSchema,
    currency: z.literal('USD'),
    /** Version label of the price table in config that priced these sessions. */
    priceTableVersion: z.string().regex(/^[A-Za-z0-9._-]{1,40}$/),
    updatedAt: IsoDateTimeSchema,
    sessions: z.array(CostSessionSchema).max(10000),
    totalUsd: usd,
  })
  .strict()
  .refine((file) => Math.abs(file.totalUsd - sumSessionUsd(file.sessions)) <= COST_SUM_TOLERANCE_USD, {
    message: 'totalUsd must equal the sum of sessions',
    path: ['totalUsd'],
  });
export type CostFile = z.infer<typeof CostFileSchema>;
