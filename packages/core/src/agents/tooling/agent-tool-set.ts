import { Inject, Injectable } from '@nestjs/common';
import { type ToolsInput } from '@mastra/core/agent';
import { AgentToolNameSchema, agentToolAllowlists, type AgentToolName, type ModelRoleName } from '@studio/shared/agents';
import { type AssetRef } from '@studio/shared/catalog';
import { type RunId, type SessionId, type StageId, type StepKey } from '@studio/shared/run-format';
import { AgentRunError } from '../agents.errors';
import { type ToolCallTrace } from '../sessions/session-stream';

/** Mastra tools keyed by C7 tool name. */
export type AgentToolSet = ToolsInput;

/** Per-call counter the tool wrapper must consult before running a tool (topology section 7). */
export interface ToolCallGate {
  /** Returns the 1-based tool call index; throws `AgentRunError` past `maxToolCalls`. */
  reserveToolCall(): number;
}

/**
 * Everything a tool is bound to at construction (topology section 3.2 "construction binding").
 * It comes from the engine's packet and run folder, never from model arguments.
 */
export interface AgentToolScope {
  readonly role: ModelRoleName;
  readonly allowlist: readonly AgentToolName[];
  readonly runId: RunId;
  readonly runDir: string;
  readonly stageId: StageId;
  readonly stepKey: StepKey;
  readonly sessionId: SessionId;
  /** Refs offered by the packet itself (Scene director `offeredRefs`); the tool set grows its own copy. */
  readonly packetRefs: readonly AssetRef[];
  /** Refs bound by the run's pinned recipe version (run.json), sensitivity unchecked. */
  readonly recipeBindingRefs: readonly AssetRef[];
  /** The call's combined signal: caller stop, timeout and budget. */
  readonly signal: AbortSignal;
  readonly gate: ToolCallGate;
  readonly trace: ToolCallTrace;
}

/**
 * Seam filled by R1-13 (`packages/core/src/agents/tools/**`): builds the read-only tools for one
 * call. It must return only tools of `scope.allowlist`; the resolver below refuses anything else.
 */
export interface AgentToolSetProvider {
  toolsFor(scope: AgentToolScope): Promise<AgentToolSet>;
}

export const AGENT_TOOL_SET_PROVIDER = Symbol('AGENT_TOOL_SET_PROVIDER');

/**
 * The binding until R1-13 registers its provider: no tools at all. Live calls of roles whose
 * allowlist is not empty then fail with `tools-unavailable` instead of running without the
 * evidence tools the topology gives them.
 */
@Injectable()
export class NoAgentToolSetProvider implements AgentToolSetProvider {
  async toolsFor(): Promise<AgentToolSet> {
    return {};
  }
}

function isAllowed(name: string, allowlist: readonly AgentToolName[]): boolean {
  const parsed = AgentToolNameSchema.safeParse(name);
  return parsed.success && allowlist.includes(parsed.data);
}

/**
 * Tool allowlist guard of topology section 8 at Agent construction. The allowlist is always the
 * C7 `agentToolAllowlists` row of the role; a provider returning an extra tool, or (in live mode)
 * missing one, fails the call closed.
 */
@Injectable()
export class AgentToolSetResolver {
  constructor(@Inject(AGENT_TOOL_SET_PROVIDER) private readonly provider: AgentToolSetProvider) {}

  async resolve(scope: Omit<AgentToolScope, 'allowlist'>, requireComplete: boolean): Promise<AgentToolSet> {
    const allowlist = agentToolAllowlists[scope.role];
    if (allowlist.length === 0) return {};
    const tools = await this.provider.toolsFor({ ...scope, allowlist });
    const names = Object.keys(tools);
    if (names.some((name) => !isAllowed(name, allowlist))) {
      throw new AgentRunError(scope.role, { kind: 'configuration', reason: 'tools-unavailable' });
    }
    if (requireComplete && allowlist.some((name) => !names.includes(name))) {
      throw new AgentRunError(scope.role, { kind: 'configuration', reason: 'tools-unavailable' });
    }
    return tools;
  }
}
