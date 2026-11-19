import { AgentRunError, describeAgentFailure, toAgentStageFailure } from '@studio/core/agents';
import { type AgentOutput, type AgentPacket, type AgentsPort, type ModelRoleName } from '@studio/shared/agents';
import type { StageExecutionContext, StageFailure } from '@studio/shared/ports';
import { type ModelUse } from '@studio/shared/run-format';
import { listSessionIds, reportNewSessions } from './session-observer';

export type AgentCallOutcome<Role extends ModelRoleName> =
  | { status: 'ok'; output: AgentOutput<Role> }
  /** `cause` names the failure kind only (core `describeAgentFailure`), never model text. */
  | { status: 'failed'; failure: StageFailure; cause: string };

/**
 * One C7 call with the stage's signal. An `AgentRunError` becomes the C6 failure core
 * `toAgentStageFailure` maps (obligation 3); a stop or step timeout is rethrown as the engine's
 * interruption; any other error is a fault and propagates. The sessions the call wrote are
 * reported as events and collected into `models`, whatever the outcome.
 */
export async function callAgent<Role extends ModelRoleName>(
  agents: AgentsPort,
  request: { context: StageExecutionContext; role: Role; packet: AgentPacket<Role>; models: ModelUse[] },
): Promise<AgentCallOutcome<Role>> {
  const { context, role, packet, models } = request;
  const before = await listSessionIds(context.runDir);
  let outcome: AgentCallOutcome<Role>;
  try {
    outcome = { status: 'ok', output: await agents.run(role, packet, { signal: context.signal }) };
  } catch (error) {
    if (!(error instanceof AgentRunError) || context.signal.aborted) throw error;
    outcome = { status: 'failed', failure: toAgentStageFailure(role, error.failure, context.stepKey), cause: describeAgentFailure(error.failure) };
  }
  await reportNewSessions(context, before, models);
  return outcome;
}
