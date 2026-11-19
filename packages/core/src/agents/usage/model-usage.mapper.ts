import { type UsageQuantity } from '@studio/shared/ports';
import {
  type CostSession,
  type ModelId,
  type ModelRole,
  type SessionId,
  type SessionOutcome,
  type StepKey,
} from '@studio/shared/run-format';
import { z } from 'zod';

/**
 * The ONE place model usage is read (SPEC 0002 A11). Every other file sees `ModelCallUsage`.
 *
 * Input: one Mastra step result (`onStepFinish`), one billed Claude call. Mastra is not installed
 * when this mapper is written, so the shape is read defensively and in this precedence:
 *
 * 1. `providerMetadata.anthropic.usage`: the raw Anthropic `usage` object (`input_tokens`,
 *    `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`). Anthropic's
 *    `input_tokens` already excludes cached tokens, which is what cost.json `inputTokens` means.
 * 2. AI SDK 6 style `usage.inputTokenDetails` (`noCacheTokens`, `cacheReadTokens`,
 *    `cacheWriteTokens`) with `usage.outputTokens`.
 * 3. AI SDK 5 style `usage.inputTokens` (the Anthropic provider maps `input_tokens`, uncached),
 *    `usage.outputTokens`, `usage.cachedInputTokens` or `providerMetadata.anthropic.
 *    cacheReadInputTokens` for reads, `providerMetadata.anthropic.cacheCreationInputTokens` for
 *    writes.
 *
 * Fields to confirm against the pinned installed versions at R1-FP: the `onStepFinish` argument
 * carries `usage` and `providerMetadata` per step; which of the three shapes the pinned
 * `@ai-sdk/anthropic` emits; whether shape 2's `inputTokens` total includes cache tokens (this
 * mapper never reads it when `noCacheTokens` is present); and that a step with no usage is
 * impossible for a billed call (the mapper returns null and the call fails closed).
 */

/** Usage of one billed Claude call; `inputTokens` is uncached input only. */
export interface ModelCallUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Null when the provider did not report the count (ADR 0002). */
  readonly cacheReadTokens: number | null;
  readonly cacheWriteTokens: number | null;
}

export const ZERO_USAGE: ModelCallUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

const count = z.number().int().nonnegative();
const optionalCount = count.nullable().optional();

const AnthropicRawUsageSchema = z
  .object({
    input_tokens: count,
    output_tokens: count,
    cache_read_input_tokens: optionalCount,
    cache_creation_input_tokens: optionalCount,
  })
  .passthrough();

const StepUsageSchema = z
  .object({
    usage: z
      .object({
        inputTokens: optionalCount,
        outputTokens: optionalCount,
        cachedInputTokens: optionalCount,
        inputTokenDetails: z
          .object({ noCacheTokens: optionalCount, cacheReadTokens: optionalCount, cacheWriteTokens: optionalCount })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    providerMetadata: z
      .object({
        anthropic: z
          .object({
            usage: z.unknown().optional(),
            cacheCreationInputTokens: optionalCount,
            cacheReadInputTokens: optionalCount,
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

function orNull(value: number | null | undefined): number | null {
  return value === undefined ? null : value;
}

/** Null when no shape yields input and output counts: such a call cannot be priced. */
export function toModelCallUsage(step: unknown): ModelCallUsage | null {
  const parsed = StepUsageSchema.safeParse(step);
  if (!parsed.success) return null;
  const { usage, providerMetadata } = parsed.data;
  const anthropic = providerMetadata?.anthropic;

  const raw = AnthropicRawUsageSchema.safeParse(anthropic?.usage);
  if (raw.success) {
    return {
      inputTokens: raw.data.input_tokens,
      outputTokens: raw.data.output_tokens,
      cacheReadTokens: orNull(raw.data.cache_read_input_tokens),
      cacheWriteTokens: orNull(raw.data.cache_creation_input_tokens),
    };
  }

  const outputTokens = usage?.outputTokens;
  if (outputTokens === undefined || outputTokens === null) return null;

  const details = usage?.inputTokenDetails;
  const noCacheTokens = details?.noCacheTokens;
  if (noCacheTokens !== undefined && noCacheTokens !== null) {
    return {
      inputTokens: noCacheTokens,
      outputTokens,
      cacheReadTokens: orNull(details?.cacheReadTokens),
      cacheWriteTokens: orNull(details?.cacheWriteTokens),
    };
  }

  const inputTokens = usage?.inputTokens;
  if (inputTokens === undefined || inputTokens === null) return null;
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens: orNull(usage?.cachedInputTokens ?? anthropic?.cacheReadInputTokens),
    cacheWriteTokens: orNull(anthropic?.cacheCreationInputTokens),
  };
}

/** Every token the call consumed, for the `maxTokens` bound. */
export function totalTokens(usage: ModelCallUsage): number {
  return usage.inputTokens + usage.outputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0);
}

/** What the price table prices; an unreported cache count is priced as zero tokens. */
export function toUsageQuantity(modelId: ModelId, usage: ModelCallUsage): UsageQuantity {
  return {
    kind: 'model',
    modelId,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens ?? 0,
    cacheWriteTokens: usage.cacheWriteTokens ?? 0,
  };
}

export interface ModelCostSessionInput {
  sessionId: SessionId;
  callIndex: number;
  stepKey: StepKey;
  role: ModelRole;
  modelId: ModelId;
  usage: ModelCallUsage;
  usd: number;
  outcome: SessionOutcome;
  startedAt: Date;
  endedAt: Date;
}

/** One cost.json `sessions[]` entry per billed call (topology section 10). */
export function toModelCostSession(input: ModelCostSessionInput): CostSession {
  return {
    kind: 'model',
    sessionId: input.sessionId,
    callIndex: input.callIndex,
    stepKey: input.stepKey,
    role: input.role,
    provider: 'claude',
    modelId: input.modelId,
    inputTokens: input.usage.inputTokens,
    outputTokens: input.usage.outputTokens,
    cacheReadTokens: input.usage.cacheReadTokens,
    cacheWriteTokens: input.usage.cacheWriteTokens,
    usd: input.usd,
    outcome: input.outcome,
    startedAt: input.startedAt.toISOString(),
    endedAt: input.endedAt.toISOString(),
  };
}
