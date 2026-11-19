import { type Prisma } from '@prisma/client';
import { type CurationCostSession, type CurationId } from '@studio/shared/curation';
import { type UsageQuantity } from '@studio/shared/ports';
import { type CostSessionKey } from './cost-session.mapper';

/** `cost_entries.source_kind` of a Curator call (SPEC 0005 B1). */
export const CURATION_COST_SOURCE_KIND = 'curation';

/**
 * `cost_entries.step_key` of a Curator call (SPEC 0005 section 4.5). It is not a C3 `StepKey`: a
 * curation has no stage, and no reader parses this column back into stage coordinates.
 */
export function curationStepKey(attempt: number): string {
  return `curation:call:${attempt}`;
}

/** The same dedupe key as a run session: C8 `@@unique([runId, sessionId, callIndex])`. */
export function curationCostSessionKey(session: CurationCostSession): CostSessionKey {
  return { sessionId: session.sessionId, callIndex: session.callIndex };
}

/** A Curator call bills when it ends, like a run model call. */
export function curationSessionOccurredAt(session: CurationCostSession): Date {
  return new Date(session.endedAt);
}

/** Quantities to re-price with the price table. */
export function usageOfCurationCostSession(session: CurationCostSession): UsageQuantity {
  return {
    kind: 'model',
    modelId: session.modelId,
    inputTokens: session.inputTokens,
    outputTokens: session.outputTokens,
    cacheReadTokens: session.cacheReadTokens,
    cacheWriteTokens: session.cacheWriteTokens,
  };
}

/** One `cost_entries` row for one billed Curator call; `run_id` holds the curation id (B1). */
export function toCurationCostEntryData(
  curationId: CurationId,
  priceTableVersion: string,
  session: CurationCostSession,
): Prisma.CostEntryCreateManyInput {
  const key = curationCostSessionKey(session);
  return {
    runId: curationId,
    sessionId: key.sessionId,
    callIndex: key.callIndex,
    kind: session.kind,
    stepKey: curationStepKey(session.attempt),
    role: session.role,
    provider: session.provider,
    modelId: session.modelId,
    inputTokens: session.inputTokens,
    outputTokens: session.outputTokens,
    cacheReadTokens: session.cacheReadTokens,
    cacheWriteTokens: session.cacheWriteTokens,
    usd: session.usd,
    priceTableVersion,
    occurredAt: curationSessionOccurredAt(session),
    sourceKind: CURATION_COST_SOURCE_KIND,
  };
}
