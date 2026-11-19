import type { StageExecutionContext } from '@studio/shared/ports';
import { newSessionId } from '@studio/shared/run-files';
import { type ModelRoleName, type ReviewVerdict } from '@studio/shared/agents';
import { type ReviewSubject } from '@studio/shared/run-format';
import { type MockStageTools } from './mock-stage-behaviour';

/** Model id recorded for mock agent calls; not a real model. */
export const MOCK_MODEL_ID = 'mock-claude';

/**
 * cost.json entries for mock work (topology section 10: one entry per billed call), all at $0,
 * plus the `session.started` / `session.ended` events through the C6 sink. R1-12 also writes
 * `sessions/<sessionId>.jsonl`.
 */
export async function recordModelSession(context: StageExecutionContext, tools: MockStageTools, role: ModelRoleName): Promise<void> {
  const sessionId = newSessionId();
  const usd = tools.ledger.priceUsd();
  const session = { sessionId, role, modelId: MOCK_MODEL_ID };
  await context.events.emit({ type: 'session.started', level: 'agent', text: `Sessão simulada iniciada: ${role}.`, ...session });
  const at = tools.clock.now().toISOString();
  await tools.ledger.record({
    runId: context.runId,
    runDir: context.runDir,
    session: {
      kind: 'model',
      sessionId,
      callIndex: 1,
      stepKey: context.stepKey,
      role,
      provider: 'claude',
      modelId: MOCK_MODEL_ID,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      usd,
      outcome: 'ok',
      startedAt: at,
      endedAt: at,
    },
  });
  await context.events.emit({
    type: 'session.ended',
    level: 'agent',
    text: `Sessão simulada encerrada: ${role}.`,
    ...session,
    outcome: 'ok',
    costUsd: usd,
  });
}

/** Topology section 10: every review emits its scores, criterion ids and retry flag as an event. */
export async function emitReviewVerdict(context: StageExecutionContext, subject: ReviewSubject, verdict: ReviewVerdict): Promise<void> {
  await context.events.emit({
    type: 'review.verdict',
    level: 'agent',
    text: `Revisão simulada (${subject}): nota geral ${verdict.overall}.`,
    subject,
    scores: verdict.scores.map(({ criterionId, score }) => ({ criterionId, score })),
    overall: verdict.overall,
    retryRecommended: verdict.retryRecommended,
  });
}

export async function recordTtsSession(context: StageExecutionContext, tools: MockStageTools, characters: number): Promise<void> {
  await tools.ledger.record({
    runId: context.runId,
    runDir: context.runDir,
    session: {
      kind: 'tts',
      sessionId: newSessionId(),
      stepKey: context.stepKey,
      provider: 'local-voice',
      characters,
      usd: tools.ledger.priceUsd(),
      at: tools.clock.now().toISOString(),
    },
  });
}

export async function recordRenderSession(context: StageExecutionContext, tools: MockStageTools, renderSeconds: number): Promise<void> {
  await tools.ledger.record({
    runId: context.runId,
    runDir: context.runDir,
    session: {
      kind: 'render',
      sessionId: newSessionId(),
      stepKey: context.stepKey,
      provider: 'render',
      renderSeconds,
      usd: tools.ledger.priceUsd(),
      at: tools.clock.now().toISOString(),
    },
  });
}
