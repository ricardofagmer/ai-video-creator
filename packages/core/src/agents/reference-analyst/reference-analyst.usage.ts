import { referenceAnalysisBounds } from '@studio/shared/asset-jobs';
import { type UsageQuantity } from '@studio/shared/ports';
import { type ModelId } from '@studio/shared/run-format';
import { WORST_CASE_CHARS_PER_TOKEN } from '../../costs';

/**
 * Input tokens one frame may cost, over-estimated: Anthropic bills an image at about
 * width x height / 750 tokens and downsizes large ones; a 1280 px frame of any aspect stays well
 * under this, also on models that keep higher resolutions.
 */
const WORST_CASE_TOKENS_PER_FRAME = 5_000;

export interface WorstCaseAnalystUsageInput {
  readonly modelId: ModelId;
  /** System block plus the redacted text part of the user message. */
  readonly promptChars: number;
  readonly frameCount: number;
}

/**
 * The usage of a live request that left but whose usage never came back (timeout, watcher stop,
 * unreadable usage): every prompt character and frame as uncached input plus the full output cap.
 * The provider may still have billed it, so the watcher records this and the month spend never
 * undercounts (the Curator's B7 rule).
 */
export function worstCaseAnalystUsage(input: WorstCaseAnalystUsageInput): UsageQuantity {
  return {
    kind: 'model',
    modelId: input.modelId,
    inputTokens: Math.ceil(input.promptChars / WORST_CASE_CHARS_PER_TOKEN) + input.frameCount * WORST_CASE_TOKENS_PER_FRAME,
    outputTokens: referenceAnalysisBounds.maxOutputTokens,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
}
