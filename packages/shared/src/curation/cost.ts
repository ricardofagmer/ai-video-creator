import { z } from 'zod';
import { CurationIdSchema, IsoDateTimeSchema, SessionIdSchema } from '../common/ids';
import { COST_SUM_TOLERANCE_USD } from '../run-format/cost';
import { CURATOR_ROLE, curationBounds } from './constants';
import { CURATION_FORMAT_VERSION } from './curation-file';
import { CurationCallOutcomeSchema } from './enums';

const tokenCount = z.number().int().min(0);

/**
 * One billed Curator call in `curations/<id>/cost.json` (SPEC 0005 section 4.3, B1). A rate-limit
 * transport retry inside one call is not a Curator call (B6). The api indexes these entries into
 * `cost_entries` with `source_kind = 'curation'`, `run_id` = the curation id and
 * `step_key` = `curation:call:<attempt>`.
 */
export const CurationCostSessionSchema = z
  .object({
    sessionId: SessionIdSchema,
    callIndex: z.number().int().min(1),
    attempt: z.number().int().min(1).max(curationBounds.maxCalls),
    kind: z.literal('model'),
    role: z.literal(CURATOR_ROLE),
    provider: z.literal('claude'),
    modelId: z.string().max(100),
    inputTokens: tokenCount,
    outputTokens: tokenCount,
    cacheReadTokens: tokenCount,
    cacheWriteTokens: tokenCount,
    usd: z.number().nonnegative(),
    outcome: CurationCallOutcomeSchema,
    startedAt: IsoDateTimeSchema,
    endedAt: IsoDateTimeSchema,
  })
  .strict();
export type CurationCostSession = z.infer<typeof CurationCostSessionSchema>;

export function sumCurationSessionUsd(sessions: readonly CurationCostSession[]): number {
  return sessions.reduce((total, session) => total + session.usd, 0);
}

/**
 * `curations/<curationId>/cost.json`, written by the watcher after every billed call through
 * `CurationCostPort`. `totalUsd` equals the sum of `sessions[].usd`, the same rule as the run
 * `cost.json`; a file that breaks it does not parse.
 */
export const CurationCostFileSchema = z
  .object({
    format: z.literal(CURATION_FORMAT_VERSION),
    curationId: CurationIdSchema,
    currency: z.literal('USD'),
    priceTableVersion: z.string(),
    updatedAt: IsoDateTimeSchema,
    sessions: z.array(CurationCostSessionSchema).max(8),
    totalUsd: z.number().nonnegative(),
  })
  .strict()
  .refine((file) => Math.abs(file.totalUsd - sumCurationSessionUsd(file.sessions)) <= COST_SUM_TOLERANCE_USD, {
    message: 'totalUsd must equal the sum of sessions',
    path: ['totalUsd'],
  });
export type CurationCostFile = z.infer<typeof CurationCostFileSchema>;
