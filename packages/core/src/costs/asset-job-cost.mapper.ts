import { type Prisma } from '@prisma/client';
import { type AssetJobCostSession, type AssetJobCostUsage, type AssetJobKind } from '@studio/shared/asset-jobs';
import { type AssetRef } from '@studio/shared/catalog';
import { type UsageQuantity } from '@studio/shared/ports';
import { type CostSessionKey } from './cost-session.mapper';

/** `cost_entries.source_kind` of an asset job call (migration `20261123180000_asset_job_cost_source`). */
export const ASSET_JOB_COST_SOURCE_KIND = 'asset-job';

/** The model role an analysis call is billed under; a voice sample is TTS and has no role. */
const REFERENCE_ANALYST_ROLE = 'reference-analyst';

/**
 * `cost_entries.step_key` of an asset job call. Not a C3 `StepKey`: a job has no stage, and no
 * reader parses this column back into stage coordinates.
 */
export function assetJobStepKey(kind: AssetJobKind): string {
  return `asset-job:${kind}`;
}

/** Each asset job session is one call, so it keys like a TTS session: C8 column default 1. */
export function assetJobCostSessionKey(session: AssetJobCostSession): CostSessionKey {
  return { sessionId: session.sessionId, callIndex: 1 };
}

export function assetJobSessionOccurredAt(session: AssetJobCostSession): Date {
  return new Date(session.occurredAt);
}

/** The cost-file usage of a port usage; null for a quantity no asset job bills (render). */
export function assetJobCostUsageOf(usage: UsageQuantity): AssetJobCostUsage | null {
  switch (usage.kind) {
    case 'model':
    case 'tts':
      return usage;
    case 'render':
      return null;
  }
}

type CostQuantities = Pick<
  Prisma.CostEntryCreateManyInput,
  'provider' | 'role' | 'modelId' | 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens' | 'ttsCharacters'
>;

function quantitiesOf(usage: AssetJobCostUsage): CostQuantities {
  switch (usage.kind) {
    case 'model':
      return {
        provider: 'claude',
        role: REFERENCE_ANALYST_ROLE,
        modelId: usage.modelId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        cacheWriteTokens: usage.cacheWriteTokens,
      };
    case 'tts':
      return { provider: usage.provider, ttsCharacters: usage.characters };
  }
}

/** One `cost_entries` row for one billed asset job call; `run_id` holds the version ref. */
export function toAssetJobCostEntryData(
  source: { kind: AssetJobKind; ref: AssetRef },
  session: AssetJobCostSession,
): Prisma.CostEntryCreateManyInput {
  const key = assetJobCostSessionKey(session);
  return {
    runId: source.ref,
    sessionId: key.sessionId,
    callIndex: key.callIndex,
    kind: session.usage.kind,
    stepKey: assetJobStepKey(source.kind),
    ...quantitiesOf(session.usage),
    usd: session.usd,
    // The session's own table version: the file's is only the newest session's.
    priceTableVersion: session.priceTableVersion,
    occurredAt: assetJobSessionOccurredAt(session),
    sourceKind: ASSET_JOB_COST_SOURCE_KIND,
  };
}
