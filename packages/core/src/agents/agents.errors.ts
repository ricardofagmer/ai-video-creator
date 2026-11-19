import { type ModelRoleName } from '@studio/shared/agents';
import { type ProviderFailure } from '../providers';

/** Per-call bound that stopped an agent call (topology section 7). */
export type BudgetBound = 'tokens' | 'usd' | 'tool-calls';

/** Why the output scan refused a structured output (topology section 8 "Output scan"). */
export type OutputRejectionReason = 'secret' | 'biometric' | 'delimiter-leak' | 'scan-failed';

/** A wiring or catalog problem a retry of the same packet cannot fix. */
export type AgentConfigurationReason = 'model-binding' | 'tools-unavailable' | 'model-unpriced';

/** Trace or ledger writes that must succeed for a call to count (topology section 10). */
export type TraceTarget = 'session-stream' | 'cost-ledger' | 'egress' | 'usage';

/**
 * Every way `AgentsService.run` fails, after its own retries (one schema-feedback retry, the
 * rate-limit ladder). The engine maps it to a C6 `StageFailure` (`toAgentStageFailure`) and the
 * role's failure policy (topology section 9).
 */
export type AgentFailure =
  | { kind: 'invalid-packet' }
  | { kind: 'invalid-output'; issueCount: number }
  | { kind: 'provider'; failure: ProviderFailure }
  | { kind: 'budget-exceeded'; bound: BudgetBound }
  | { kind: 'timeout' }
  | { kind: 'cancelled' }
  | { kind: 'output-rejected'; reason: OutputRejectionReason }
  | { kind: 'redaction-failed' }
  | { kind: 'configuration'; reason: AgentConfigurationReason }
  | { kind: 'trace-failed'; target: TraceTarget }
  | { kind: 'internal' };

export type AgentErrorCategory = 'validation' | 'dependency' | 'auth' | 'internal';

function categoryOf(failure: AgentFailure): AgentErrorCategory {
  switch (failure.kind) {
    case 'invalid-packet':
    case 'invalid-output':
    case 'output-rejected':
    case 'configuration':
      return 'validation';
    case 'provider':
      return failure.failure.class === 'authentication' ? 'auth' : 'dependency';
    case 'budget-exceeded':
    case 'timeout':
    case 'cancelled':
    case 'redaction-failed':
    case 'trace-failed':
      return 'dependency';
    case 'internal':
      return 'internal';
  }
}

/** Short English label of a failure for logs and session streams; never upstream text. */
export function describeAgentFailure(failure: AgentFailure): string {
  switch (failure.kind) {
    case 'invalid-output':
      return `invalid-output (${failure.issueCount} issues after the schema-feedback retry)`;
    case 'provider':
      return `provider ${failure.failure.class}`;
    case 'budget-exceeded':
      return `budget-exceeded (${failure.bound})`;
    case 'output-rejected':
      return `output-rejected (${failure.reason})`;
    case 'configuration':
      return `configuration (${failure.reason})`;
    case 'trace-failed':
      return `trace-failed (${failure.target})`;
    case 'invalid-packet':
    case 'timeout':
    case 'cancelled':
    case 'redaction-failed':
    case 'internal':
      return failure.kind;
  }
}

/**
 * The only error `AgentsService.run` rejects with. The message is built from the role and the
 * failure kind only: no model text, packet content, key or provider response body is attached,
 * and `cause` is never set.
 */
export class AgentRunError extends Error {
  readonly category: AgentErrorCategory;

  constructor(
    readonly role: ModelRoleName | null,
    readonly failure: AgentFailure,
  ) {
    super(`Agent ${role ?? 'call'} failed: ${describeAgentFailure(failure)}`);
    this.name = 'AgentRunError';
    this.category = categoryOf(failure);
  }
}

/** Raised by a Claude adapter for a classified provider failure; converted by the service. */
export class ProviderCallError extends Error {
  constructor(readonly failure: ProviderFailure) {
    super(`Claude call failed: ${failure.class}`);
    this.name = 'ProviderCallError';
  }
}
