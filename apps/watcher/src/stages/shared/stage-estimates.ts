import { PriceNotAvailableError } from '@studio/core/costs';
import { agentBounds, type ModelRoleName } from '@studio/shared/agents';
import type { CostLedgerPort, StagePlanningContext, UsageQuantity } from '@studio/shared/ports';
import { type StageEstimate } from '@studio/shared/run-format';

/** Average characters per spoken word, pt-BR and en-US narration, spaces included. */
const CHARACTERS_PER_WORD = 6;

/**
 * Upper-bound estimate of agent calls from the topology section 7 per-call bounds: the engine
 * compares it with the cost ceilings at `preflight`, so it errs high. Mock calls price at zero.
 */
export function agentCallsEstimate(roles: readonly ModelRoleName[], live: boolean): StageEstimate {
  const tokens = roles.reduce((total, role) => total + agentBounds[role].maxTokens, 0);
  const usd = live ? roles.reduce((total, role) => total + agentBounds[role].maxUsd, 0) : 0;
  return { tokens, ttsChars: 0, renderSec: 0, usd };
}

/** Generator plus Reviewer, once per allowed attempt (1 + `limits.revisionsPerStage`). */
export function evaluatorLoopRoles(generator: ModelRoleName, context: StagePlanningContext): ModelRoleName[] {
  const attempts = 1 + context.limits.revisionsPerStage;
  return Array.from({ length: attempts }, (): ModelRoleName[] => [generator, 'evaluator']).flat();
}

export function narrationCharacters(context: StagePlanningContext): number {
  const words = context.brief.targetDurationSec * context.recipe.format.narration.maxWordsPerSecond;
  return Math.round(words * CHARACTERS_PER_WORD);
}

/**
 * Prices a usage for an estimate without throwing: `estimate` must never fail the preflight. An
 * unpriced live quantity (ElevenLabs today) estimates at zero here; the executor refuses the live
 * call itself before any spend (R1-11 fails closed).
 */
export function priceForEstimate(ledger: CostLedgerPort, usage: UsageQuantity): number {
  try {
    return ledger.priceUsd(usage);
  } catch (error) {
    if (error instanceof PriceNotAvailableError) return 0;
    throw error;
  }
}
