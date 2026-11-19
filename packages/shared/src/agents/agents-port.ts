import type { z } from 'zod';
import type { ModelRoleName } from './protocol';
import type { AgentContracts } from './role-contracts';

/** The packet a role accepts (topology section 4). */
export type AgentPacket<Role extends ModelRoleName> = z.infer<AgentContracts[Role]['packet']>;

/** The strict output a role answers with (topology section 4). */
export type AgentOutput<Role extends ModelRoleName> = z.infer<AgentContracts[Role]['output']>;

/**
 * Per-call options (SPEC 0002 rev 2, owner decision 2026-11-18). `signal` lets an engine `stop`
 * abort an in-flight call instead of waiting for `budget.timeoutMs`; an aborted call rejects and
 * never resolves with a partial output.
 */
export interface AgentRunOptions {
  readonly signal?: AbortSignal;
}

/**
 * `AgentsService.run(role, packet, options?)` (topology section 7, SPEC 0002 C7 rev 2): the only
 * entry point to the agents, called by the engine's `execute` and recovery steps. Implemented by
 * the NestJS `agents` module (R1-12) on Mastra; mocked by the tracer (R1-04). Framework-free on
 * purpose. The promise resolves only with an output that passed the role's strict schema.
 */
export interface AgentsPort {
  run<Role extends ModelRoleName>(
    role: Role,
    packet: AgentPacket<Role>,
    options?: AgentRunOptions,
  ): Promise<AgentOutput<Role>>;
}
