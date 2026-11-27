import { z } from 'zod';
import { AssetRefSchema } from '../catalog/asset-kind';
import { IsoDateTimeSchema, SessionIdSchema } from '../common/ids';
import { COST_SUM_TOLERANCE_USD } from '../run-format/cost';
import { ModelIdSchema } from '../run-format/vocabulary';
import { AssetJobKindSchema } from './asset-job';
import { ASSET_JOB_COST_SESSIONS_MAX } from './constants';

/** cost.json format of an asset job folder. */
export const ASSET_JOB_COST_FORMAT_VERSION = 1;

const tokenCount = z.number().int().nonnegative();

/** The model quantities of a run `model` cost session, without its run-bound fields. */
const AssetJobModelUsageSchema = z
  .object({
    kind: z.literal('model'),
    modelId: ModelIdSchema,
    inputTokens: tokenCount,
    outputTokens: tokenCount,
    cacheReadTokens: tokenCount,
    cacheWriteTokens: tokenCount,
  })
  .strict();

/** The quantities of a run `tts` cost session, without its run-bound fields. */
const AssetJobTtsUsageSchema = z
  .object({
    kind: z.literal('tts'),
    provider: z.enum(['elevenlabs', 'local-voice']),
    characters: z.number().int().nonnegative(),
  })
  .strict();

/** What one billed asset job call consumed; the `model` and `tts` arms of `UsageQuantity`. */
export const AssetJobCostUsageSchema = z.discriminatedUnion('kind', [AssetJobModelUsageSchema, AssetJobTtsUsageSchema]);
export type AssetJobCostUsage = z.infer<typeof AssetJobCostUsageSchema>;

/**
 * One billed call in `asset-jobs/<kind>/<ref>/cost.json`. The api indexes it into `cost_entries`
 * with `source_kind = 'asset-job'`, `run_id` = the job ref, `session_id` = `sessionId`,
 * `call_index` = 1 and `step_key` = `asset-job:<kind>`.
 */
export const AssetJobCostSessionSchema = z
  .object({
    sessionId: SessionIdSchema,
    usage: AssetJobCostUsageSchema,
    usd: z.number().nonnegative(),
    occurredAt: IsoDateTimeSchema,
    /** The price table that priced this call. Kept per session because the file outlives app updates. */
    priceTableVersion: z.string().max(100),
    /**
     * Present, and only ever `true`, when `usd` is a worst case priced before the call rather than
     * the billed amount (the call returned no usage). Absent on every billed entry.
     */
    estimated: z.literal(true).optional(),
  })
  .strict();
export type AssetJobCostSession = z.infer<typeof AssetJobCostSessionSchema>;

export function sumAssetJobSessionUsd(sessions: readonly AssetJobCostSession[]): number {
  return sessions.reduce((total, session) => total + session.usd, 0);
}

/**
 * `asset-jobs/<kind>/<ref>/cost.json`, written by the watcher after every billed call through
 * `AssetJobCostPort.record`. It outlives re-requests of the job, so it holds every billed call of
 * that version and job kind. The file-level `priceTableVersion` is the newest session's; each session
 * keeps its own, so a price table upgrade never stops recording. `totalUsd` equals the sum of `sessions[].usd`, the run cost.json rule;
 * a file that breaks it does not parse.
 */
export const AssetJobCostFileSchema = z
  .object({
    format: z.literal(ASSET_JOB_COST_FORMAT_VERSION),
    kind: AssetJobKindSchema,
    ref: AssetRefSchema,
    currency: z.literal('USD'),
    priceTableVersion: z.string().max(100),
    updatedAt: IsoDateTimeSchema,
    sessions: z.array(AssetJobCostSessionSchema).max(ASSET_JOB_COST_SESSIONS_MAX),
    totalUsd: z.number().nonnegative(),
  })
  .strict()
  .refine((file) => Math.abs(file.totalUsd - sumAssetJobSessionUsd(file.sessions)) <= COST_SUM_TOLERANCE_USD, {
    message: 'totalUsd must equal the sum of sessions[].usd',
    path: ['totalUsd'],
  });
export type AssetJobCostFile = z.infer<typeof AssetJobCostFileSchema>;
