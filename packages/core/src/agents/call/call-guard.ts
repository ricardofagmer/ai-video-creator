import { agentBounds, type AgentBounds, type Budget, type ModelRoleName } from '@studio/shared/agents';
import { AgentRunError, type AgentFailure } from '../agents.errors';

/**
 * The bounds one call runs under: the packet budget the engine copied, never above the topology
 * section 7 row. A packet cannot widen a bound, only narrow it.
 */
export function effectiveBounds(role: ModelRoleName, budget: Budget): AgentBounds {
  const topology = agentBounds[role];
  return {
    maxSteps: topology.maxSteps,
    maxToolCalls: Math.min(topology.maxToolCalls, budget.maxToolCalls),
    maxTokens: Math.min(topology.maxTokens, budget.maxTokens),
    maxUsd: Math.min(topology.maxUsd, budget.maxUsd),
    timeoutMs: Math.min(topology.timeoutMs, budget.timeoutMs),
  };
}

/** Rough input-token estimate for the pre-call check; the exact count comes back as usage. */
const CHARACTERS_PER_TOKEN = 4;

export function estimateTokens(characters: number): number {
  return Math.ceil(characters / CHARACTERS_PER_TOKEN);
}

/**
 * Per-call accounting of tokens, USD and tool calls (topology section 7). Crossing a bound, or a
 * trace failure reported from inside the model loop, records the failure once and aborts the
 * call's signal: Mastra callbacks cannot be relied on to propagate a thrown error, so the abort
 * is what stops the loop, and `failure` is what the service reports.
 */
export class CallGuard {
  private readonly controller = new AbortController();
  private tokens = 0;
  private usd = 0;
  private toolCalls = 0;
  private recorded: AgentFailure | null = null;

  constructor(
    readonly role: ModelRoleName,
    readonly bounds: AgentBounds,
  ) {}

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get failure(): AgentFailure | null {
    return this.recorded;
  }

  get spentUsd(): number {
    return this.usd;
  }

  get spentTokens(): number {
    return this.tokens;
  }

  /** Records the first failure and stops the call; later failures are consequences of it. */
  fail(failure: AgentFailure): AgentRunError {
    if (this.recorded === null) {
      this.recorded = failure;
      this.controller.abort(new AgentRunError(this.role, failure));
    }
    return new AgentRunError(this.role, this.recorded);
  }

  /** Before a model call leaves the machine: refuse it when the budget is already spent. */
  assertCanCallModel(estimatedInputTokens: number): void {
    if (this.recorded !== null) throw new AgentRunError(this.role, this.recorded);
    if (this.tokens + estimatedInputTokens > this.bounds.maxTokens) throw this.fail({ kind: 'budget-exceeded', bound: 'tokens' });
    if (this.usd >= this.bounds.maxUsd) throw this.fail({ kind: 'budget-exceeded', bound: 'usd' });
  }

  /** After a billed call; the call already happened, so crossing a bound stops the next one. */
  addModelCall(tokens: number, usd: number): void {
    this.tokens += tokens;
    this.usd += usd;
    if (this.tokens > this.bounds.maxTokens) this.fail({ kind: 'budget-exceeded', bound: 'tokens' });
    else if (this.usd > this.bounds.maxUsd) this.fail({ kind: 'budget-exceeded', bound: 'usd' });
  }

  /**
   * Tool-call counter (topology section 7 "tool wrapper's call counter"). The R1-13 wrapper calls
   * it before running a tool; the call past `maxToolCalls` is refused and stops the agent.
   */
  reserveToolCall(): number {
    if (this.recorded !== null) throw new AgentRunError(this.role, this.recorded);
    if (this.toolCalls >= this.bounds.maxToolCalls) throw this.fail({ kind: 'budget-exceeded', bound: 'tool-calls' });
    this.toolCalls += 1;
    return this.toolCalls;
  }
}

/** The three ways a call is stopped from outside the model loop, kept apart to name the cause. */
export interface CallSignals {
  readonly combined: AbortSignal;
  readonly timeout: AbortSignal;
  readonly caller: AbortSignal | undefined;
}

export function callSignals(guard: CallGuard, caller: AbortSignal | undefined): CallSignals {
  const timeout = AbortSignal.timeout(guard.bounds.timeoutMs);
  const sources = caller === undefined ? [timeout, guard.signal] : [caller, timeout, guard.signal];
  return { combined: AbortSignal.any(sources), timeout, caller };
}

/**
 * Why the call was stopped, if it was: the caller's `stop` first (C7 rev 2), then a recorded
 * guard failure, then the wall-clock timeout.
 */
export function stoppedBecause(guard: CallGuard, signals: CallSignals): AgentFailure | null {
  if (signals.caller?.aborted === true) return { kind: 'cancelled' };
  if (guard.failure !== null) return guard.failure;
  if (signals.timeout.aborted) return { kind: 'timeout' };
  return null;
}
