import { type ModelRoleName } from '@studio/shared/agents';
import { type StageFailure } from '@studio/shared/ports';
import { type StepKey } from '@studio/shared/run-format';
import { toStageFailure } from '../../providers';
import { describeAgentFailure, type AgentFailure } from '../agents.errors';
import { ownerCauseText } from './agent-failure-policy';

/**
 * C6 `StageFailure` of a failed agent call, for the stage executors (R1-14). Provider failures
 * reuse the R1-11 mapping (authentication is never retried and gets no Recovery call). Failures
 * that repeat identically on the same packet (a bound, a rejected output, a bad binding, a broken
 * packet) go to the owner instead of burning attempts. Messages carry kinds, never upstream text.
 */
export function toAgentStageFailure(role: ModelRoleName, failure: AgentFailure, stepKey: StepKey): StageFailure {
  const message = describeAgentFailure(failure);
  switch (failure.kind) {
    case 'provider':
      return toStageFailure(failure.failure);
    case 'invalid-output':
      return { class: 'retryable', kind: 'invalid-output', message };
    case 'timeout':
    case 'cancelled':
      return { class: 'retryable', kind: 'timeout', message };
    case 'redaction-failed':
    case 'trace-failed':
    case 'internal':
      return { class: 'retryable', kind: 'tool', message };
    case 'invalid-packet':
    case 'budget-exceeded':
    case 'output-rejected':
    case 'configuration':
      return {
        class: 'needs-person',
        cause: { kind: 'agent-failed', role, stepKey },
        message,
        whatToDo: `Verifique a etapa: ${ownerCauseText(failure)}. Ajuste e retome a execução.`,
      };
  }
}
