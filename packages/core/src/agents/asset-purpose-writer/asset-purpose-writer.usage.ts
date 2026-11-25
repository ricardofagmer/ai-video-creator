import { assetPurposeBounds } from '@studio/shared/asset-jobs';
import { type UsageQuantity } from '@studio/shared/ports';
import { type ModelId } from '@studio/shared/run-format';
import { WORST_CASE_CHARS_PER_TOKEN } from '../../costs';

/**
 * Input tokens one image may cost, over-estimated as for the reference analyst's frames: Anthropic
 * bills about width x height / 750 tokens and downsizes large images.
 */
const WORST_CASE_TOKENS_PER_IMAGE = 5_000;

/**
 * The usage of a live request that left but whose usage never came back (timeout, watcher stop,
 * unreadable usage): every prompt character and the image, if one was sent, as uncached input plus
 * the full output cap. The
 * provider may still have billed it, so the watcher records this and the month spend never
 * undercounts (the Curator's B7 rule).
 */
export function worstCasePurposeUsage(modelId: ModelId, promptChars: number, imageCount: number): UsageQuantity {
  return {
    kind: 'model',
    modelId,
    inputTokens: Math.ceil(promptChars / WORST_CASE_CHARS_PER_TOKEN) + imageCount * WORST_CASE_TOKENS_PER_IMAGE,
    outputTokens: assetPurposeBounds.maxOutputTokens,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
}
