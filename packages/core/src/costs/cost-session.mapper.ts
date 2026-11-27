import { type Prisma } from '@prisma/client';
import { type UsageQuantity } from '@studio/shared/ports';
import { type CostSession, type RunId } from '@studio/shared/run-format';

/** The ledger's dedupe key within a run: C8 `@@unique([runId, sessionId, callIndex])`. */
export interface CostSessionKey {
  sessionId: string;
  callIndex: number;
}

/** `callIndex` for model calls; 1 for TTS, render and music, as the C8 column default says. */
export function costSessionKey(session: CostSession): CostSessionKey {
  return { sessionId: session.sessionId, callIndex: session.kind === 'model' ? session.callIndex : 1 };
}

export function costSessionKeyText(runId: string, key: CostSessionKey): string {
  return `${runId}/${key.sessionId}/${key.callIndex}`;
}

/** When the spend happened: a model call bills when it ends; TTS, render and music carry `at`. */
export function costSessionOccurredAt(session: CostSession): Date {
  return new Date(session.kind === 'model' ? session.endedAt : session.at);
}

/** Quantities to re-price; a cache count the provider did not report counts as zero tokens. */
export function usageOfCostSession(session: CostSession): UsageQuantity {
  switch (session.kind) {
    case 'model':
      return {
        kind: 'model',
        modelId: session.modelId,
        inputTokens: session.inputTokens,
        outputTokens: session.outputTokens,
        cacheReadTokens: session.cacheReadTokens ?? 0,
        cacheWriteTokens: session.cacheWriteTokens ?? 0,
      };
    case 'tts':
      return { kind: 'tts', provider: session.provider, characters: session.characters };
    case 'render':
      return { kind: 'render', renderSeconds: session.renderSeconds };
    case 'music':
      return { kind: 'music', provider: session.provider, musicSeconds: session.musicSeconds };
  }
}

/** One `cost_entries` row mirroring one C3 `CostSession` (C8 `CostEntry`). */
export function toCostEntryData(
  runId: RunId,
  priceTableVersion: string,
  session: CostSession,
): Prisma.CostEntryCreateManyInput {
  const key = costSessionKey(session);
  const common = {
    runId,
    sessionId: key.sessionId,
    callIndex: key.callIndex,
    kind: session.kind,
    stepKey: session.stepKey,
    provider: session.provider,
    usd: session.usd,
    priceTableVersion,
    occurredAt: costSessionOccurredAt(session),
    sourceKind: 'run',
  };
  switch (session.kind) {
    case 'model':
      return {
        ...common,
        role: session.role,
        modelId: session.modelId,
        inputTokens: session.inputTokens,
        outputTokens: session.outputTokens,
        cacheReadTokens: session.cacheReadTokens,
        cacheWriteTokens: session.cacheWriteTokens,
      };
    case 'tts':
      return { ...common, ttsCharacters: session.characters };
    case 'render':
      return { ...common, renderSeconds: session.renderSeconds };
    case 'music':
      return { ...common, musicSeconds: session.musicSeconds };
  }
}
