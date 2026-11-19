import { z } from 'zod';
import { CurationIdSchema, IsoDateTimeSchema, SessionIdSchema } from '../common/ids';
import { CURATOR_ROLE, curationBounds } from './constants';
import { CurationCallOutcomeSchema } from './enums';

const tokenCount = z.number().int().min(0);

/** Token usage of one Curator call; the same four counts the cost entry carries. */
export const CurationUsageSchema = z
  .object({
    inputTokens: tokenCount,
    outputTokens: tokenCount,
    cacheReadTokens: tokenCount,
    cacheWriteTokens: tokenCount,
  })
  .strict();
export type CurationUsage = z.infer<typeof CurationUsageSchema>;

const modelId = z.string().max(100);
const instructionVersion = z.string().max(40);

/**
 * One line of `curations/<curationId>/session.jsonl` (SPEC 0005 section 4.3, L4), append-only and
 * redacted before it is written; a redactor failure writes nothing and fails the call. `prompt` is
 * the redacted packet rendering, `output` the redacted answer. The `end` line is written in a
 * `finally` block with `instructionVersion`, so failed calls are metered too (C5-AC-21); `usage`
 * is null when the call ended before the provider reported any.
 */
export const CurationSessionLineSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('start'),
      sessionId: SessionIdSchema,
      curationId: CurationIdSchema,
      attempt: z.number().int().min(1).max(curationBounds.maxCalls),
      role: z.literal(CURATOR_ROLE),
      modelId,
      instructionVersion,
      at: IsoDateTimeSchema,
    })
    .strict(),
  z.object({ type: z.literal('prompt'), sessionId: SessionIdSchema, text: z.string(), at: IsoDateTimeSchema }).strict(),
  z.object({ type: z.literal('output'), sessionId: SessionIdSchema, text: z.string(), at: IsoDateTimeSchema }).strict(),
  z
    .object({
      type: z.literal('end'),
      sessionId: SessionIdSchema,
      outcome: CurationCallOutcomeSchema,
      instructionVersion,
      usage: CurationUsageSchema.nullable(),
      at: IsoDateTimeSchema,
    })
    .strict(),
]);
export type CurationSessionLine = z.infer<typeof CurationSessionLineSchema>;
