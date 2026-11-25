import { type ModelId } from '@studio/shared/run-format';
import { SONNET_MODEL_ID } from '../agent-roster';

/**
 * The asset purpose writer (ADR 0012). Kept apart from `agentRoster` like the reference analyst:
 * it works on a catalog version outside any run, so it is not a `ModelRoleName`, has no tools and
 * no recipe binding can change its model.
 */
export interface AssetPurposeWriterDefinition {
  readonly agentName: string;
  readonly defaultModelId: ModelId;
  readonly tools: readonly [];
}

// One short sentence from bounded catalog text: the writer-tier model the reference analyst uses.
export const assetPurposeWriterDefinition: AssetPurposeWriterDefinition = {
  agentName: 'asset-purpose-writer',
  defaultModelId: SONNET_MODEL_ID,
  tools: [],
};

/** Injection token the hosts bind as `AssetPurposeWriterPort` (`@studio/shared/ports`). */
export const ASSET_PURPOSE_WRITER_PORT = Symbol('ASSET_PURPOSE_WRITER_PORT');
