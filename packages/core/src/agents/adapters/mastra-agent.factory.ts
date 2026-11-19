import { createAnthropic } from '@ai-sdk/anthropic';
import { Agent } from '@mastra/core/agent';
import { Injectable } from '@nestjs/common';
import { type ModelRoleName } from '@studio/shared/agents';
import { type ModelId } from '@studio/shared/run-format';
import { type Secret } from '../../secrets';
import { agentRoster, curatorAgentDefinition } from '../agent-roster';
import { type AgentToolSet } from '../tooling/agent-tool-set';
import { withBeforeCallHook, type AnthropicLanguageModel } from './outgoing-prompt';

/**
 * Pinned so an inherited environment variable can never redirect the key to another host; the
 * watcher's only egress is the Anthropic API (topology section 8 "No agent egress").
 */
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';

/**
 * Prompt-cache breakpoint with the default 5-minute TTL: the R1-11 price table prices only
 * 5-minute cache writes (1.25x input); a 1-hour TTL would be billed above the recorded USD.
 */
export const ANTHROPIC_CACHE_BREAKPOINT = { anthropic: { cacheControl: { type: 'ephemeral' } } };

export interface AgentBuildRequest {
  role: ModelRoleName;
  modelId: ModelId;
  apiKey: Secret;
  instructions: string;
  tools: AgentToolSet;
  beforeModelCall: (prompt: unknown) => Promise<void>;
}

export interface CuratorAgentBuildRequest {
  modelId: ModelId;
  apiKey: Secret;
  /** The `curator@1` instructions: identical on both calls, so they stay cacheable. */
  instructions: string;
  /** The rendered `CuratorCorrection` of the second call; null on the first. */
  correction: string | null;
  beforeModelCall: (prompt: unknown) => Promise<void>;
}

/**
 * Builds the Mastra `Agent` of a role (topology section 2). One agent definition per role; an
 * instance is built per call because its tools are bound to that call's run, step and budget
 * (topology section 3.2 "construction binding") and its model carries that call's egress hook.
 * The agent is standalone: no `Mastra` instance, so no storage, memory, workflow, server or HTTP
 * route exists (D18).
 */
@Injectable()
export class MastraAgentFactory {
  build(request: AgentBuildRequest): Agent {
    const definition = agentRoster[request.role];
    return new Agent({
      id: definition.agentName,
      name: definition.agentName,
      instructions: { role: 'system', content: request.instructions, providerOptions: ANTHROPIC_CACHE_BREAKPOINT },
      model: hookedAnthropicModel(request),
      tools: request.tools,
    });
  }

  /**
   * The Curator agent (topology 0004 sections 2, 3 and 7): an empty tool set, the `curator@1`
   * instructions as the cached system block and, on the second call only, the correction as a
   * second system block after the cache breakpoint (SPEC 0005 B11), so the cached prefix is reused.
   */
  buildCurator(request: CuratorAgentBuildRequest): Agent {
    return new Agent({
      id: curatorAgentDefinition.agentName,
      name: curatorAgentDefinition.agentName,
      instructions:
        request.correction === null
          ? { role: 'system', content: request.instructions, providerOptions: ANTHROPIC_CACHE_BREAKPOINT }
          : [
              { role: 'system', content: request.instructions, providerOptions: ANTHROPIC_CACHE_BREAKPOINT },
              { role: 'system', content: request.correction },
            ],
      model: hookedAnthropicModel(request),
      tools: {},
    });
  }
}

function hookedAnthropicModel(request: { modelId: ModelId; apiKey: Secret; beforeModelCall: (prompt: unknown) => Promise<void> }): AnthropicLanguageModel {
  const anthropic = createAnthropic({ apiKey: request.apiKey.revealForProviderCall(), baseURL: ANTHROPIC_BASE_URL });
  return withBeforeCallHook(anthropic(request.modelId), request.beforeModelCall);
}
