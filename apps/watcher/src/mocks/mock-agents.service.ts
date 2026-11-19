import { setTimeout as delay } from 'node:timers/promises';
import {
  DIRECTOR_ROLE,
  EVALUATOR_ROLE,
  PLANNER_ROLE,
  RECOVERY_ROLE,
  WRITER_ROLE,
  agentContracts,
  type AgentOutput,
  type AgentPacket,
  type AgentRunOptions,
  type AgentsPort,
  type ModelRoleName,
} from '@studio/shared/agents';
import { mockPlanFor, mockRecoveryActionFor, mockScenesFor, mockScript, mockVerdictFor } from './fixtures/agent-output.fixtures';

/** Enough latency that a `stop` can land mid-call, short enough for an offline tracer run. */
const MOCK_CALL_LATENCY_MS = 5;

type MockResponders = { [Role in ModelRoleName]: (packet: AgentPacket<Role>) => AgentOutput<Role> };

const responders: MockResponders = {
  [PLANNER_ROLE]: mockPlanFor,
  [WRITER_ROLE]: () => mockScript,
  [DIRECTOR_ROLE]: mockScenesFor,
  [EVALUATOR_ROLE]: mockVerdictFor,
  [RECOVERY_ROLE]: mockRecoveryActionFor,
};

/**
 * `AgentsPort` without a model (R1-04). It parses the packet and its own answer with the role's
 * C7 schemas, so a packet builder or fixture that drifts from the contract throws instead of
 * passing silently. An aborted `signal` rejects the call (C7 rev 2). R1-12 binds the Mastra
 * `AgentsService` to `AGENTS` instead.
 */
export class MockAgentsService implements AgentsPort {
  async run<Role extends ModelRoleName>(role: Role, packet: AgentPacket<Role>, options?: AgentRunOptions): Promise<AgentOutput<Role>> {
    const contract = agentContracts[role];
    contract.packet.parse(packet);
    await delay(MOCK_CALL_LATENCY_MS, undefined, { signal: options?.signal });
    const output = responders[role](packet);
    contract.output.parse(output);
    return output;
  }
}
