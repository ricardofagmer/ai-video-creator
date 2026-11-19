import {
  CURATOR_OUTPUT_CONTRACT,
  CURATOR_PROPOSE_TASK,
  CuratorTaskPacketSchema,
  curationBounds,
  type CurationId,
  type CuratorTaskPacket,
} from '@studio/shared/curation';

/** The packet `inputs` the evidence collector builds; identical bytes on both calls (L3, Q3). */
export type CuratorPacketInputs = CuratorTaskPacket['inputs'];

export interface BuildCuratorPacketInput {
  curationId: CurationId;
  /** 1, or 2 for the one corrective call. */
  attempt: number;
  inputs: CuratorPacketInputs;
  /** `curation.json` `spentUsd` before this call. */
  spentUsd: number;
}

/**
 * The Curator packet of topology 0004 section 5 with the section 7 budget: 8,000 tokens, no tool
 * call, 120 s, and `maxUsd` = $1.00 minus what this curation already spent. Only `attempt` and
 * `budget` differ between the two calls (SPEC 0005 L3). Parsed whole, so a third attempt or a
 * spent budget throws instead of reaching the model.
 */
export function buildCuratorPacket(input: BuildCuratorPacketInput): CuratorTaskPacket {
  return CuratorTaskPacketSchema.parse({
    curationId: input.curationId,
    attempt: input.attempt,
    budget: {
      maxTokens: curationBounds.maxOutputTokens,
      maxToolCalls: 0,
      timeoutMs: curationBounds.callTimeoutMs,
      maxUsd: curationBounds.maxUsd - input.spentUsd,
    },
    task: CURATOR_PROPOSE_TASK,
    inputs: input.inputs,
    constraints: { bodyOnly: true, maxBodyChars: curationBounds.maxBodyChars, evidenceFromPacketOnly: true },
    outputContract: CURATOR_OUTPUT_CONTRACT,
  });
}
