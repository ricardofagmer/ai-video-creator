import {
  DIRECTOR_ROLE,
  EVALUATOR_ROLE,
  PLANNER_ROLE,
  RECOVERY_ROLE,
  WRITER_ROLE,
  agentToolAllowlists,
  type AgentToolName,
  type ModelRoleName,
} from '@studio/shared/agents';
import { CURATOR_ROLE } from '@studio/shared/curation';
import { type ModelId } from '@studio/shared/run-format';

/** ADR 0002 "Models" defaults; a recipe overrides one role through its `model:<role>` binding. */
export const OPUS_MODEL_ID: ModelId = 'claude-opus-5-5';
export const SONNET_MODEL_ID: ModelId = 'claude-sonnet-5-5';

/**
 * Model id written to session streams and cost.json for mock calls. It is not a provider model,
 * so a mock session can never be mistaken for a billed one.
 */
export const MOCK_MODEL_ID: ModelId = 'mock-claude';

export interface AgentDefinition {
  readonly role: ModelRoleName;
  /** Mastra agent id and name. */
  readonly agentName: string;
  readonly defaultModelId: ModelId;
  /** Topology section 2 tools column; the C7 allowlist, never a local copy. */
  readonly tools: readonly AgentToolName[];
}

/** Topology section 2 roster: one Mastra agent per model role. */
export const agentRoster: Readonly<Record<ModelRoleName, AgentDefinition>> = {
  [PLANNER_ROLE]: {
    role: PLANNER_ROLE,
    agentName: 'planner',
    defaultModelId: OPUS_MODEL_ID,
    tools: agentToolAllowlists[PLANNER_ROLE],
  },
  [WRITER_ROLE]: {
    role: WRITER_ROLE,
    agentName: 'scriptwriter',
    defaultModelId: SONNET_MODEL_ID,
    tools: agentToolAllowlists[WRITER_ROLE],
  },
  [DIRECTOR_ROLE]: {
    role: DIRECTOR_ROLE,
    agentName: 'scene-director',
    defaultModelId: SONNET_MODEL_ID,
    tools: agentToolAllowlists[DIRECTOR_ROLE],
  },
  [EVALUATOR_ROLE]: {
    role: EVALUATOR_ROLE,
    agentName: 'reviewer',
    defaultModelId: SONNET_MODEL_ID,
    tools: agentToolAllowlists[EVALUATOR_ROLE],
  },
  [RECOVERY_ROLE]: {
    role: RECOVERY_ROLE,
    agentName: 'recovery',
    defaultModelId: OPUS_MODEL_ID,
    tools: agentToolAllowlists[RECOVERY_ROLE],
  },
};

/**
 * The Curator (topology 0004 section 2, SPEC 0005 section 5.5). Kept apart from `agentRoster`:
 * `curator` is not a `ModelRoleName` (SPEC 0005 B2, L2), so the run-bound maps stay unchanged.
 * It has no tools (topology 0004 section 3) and no recipe binding can override its model.
 */
export interface CuratorAgentDefinition {
  readonly role: typeof CURATOR_ROLE;
  readonly agentName: string;
  readonly defaultModelId: ModelId;
  readonly tools: readonly [];
}

export const curatorAgentDefinition: CuratorAgentDefinition = {
  role: CURATOR_ROLE,
  agentName: 'curator',
  defaultModelId: OPUS_MODEL_ID,
  tools: [],
};
