import { type ModelId } from '@studio/shared/run-format';
import { SONNET_MODEL_ID } from '../agent-roster';

/**
 * The reference analyst (docs/specs/2026-11-23-guided-creation-design.md section 4). Kept apart
 * from `agentRoster` like the Curator: it works on a catalog item outside any run, so it is not a
 * `ModelRoleName`, has no tools and no recipe binding can change its model.
 */
export interface ReferenceAnalystDefinition {
  readonly agentName: string;
  readonly defaultModelId: ModelId;
  readonly tools: readonly [];
}

// Describing eight frames is a bounded vision and summary call: the writer-tier model fits it.
export const referenceAnalystDefinition: ReferenceAnalystDefinition = {
  agentName: 'reference-analyst',
  defaultModelId: SONNET_MODEL_ID,
  tools: [],
};

/** Injection token the hosts bind as `ReferenceAnalystPort` (`@studio/shared/ports`). */
export const REFERENCE_ANALYST_PORT = Symbol('REFERENCE_ANALYST_PORT');
