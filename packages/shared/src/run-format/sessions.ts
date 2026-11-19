import { z } from 'zod';
import { EpochMsSchema, LearningNoteIdSchema, SessionIdSchema } from '../common/ids';
import { JsonValueSchema } from '../common/json';
import { AssetRefSchema } from '../catalog/asset-kind';
import { StepKeySchema } from './step-key';
import { ModelIdSchema, ModelRoleSchema, SessionOutcomeSchema } from './vocabulary';

const lineBase = { atMs: EpochMsSchema, sessionId: SessionIdSchema };
const toolName = z.string().regex(/^[A-Za-z][A-Za-z0-9]{1,63}$/);

/**
 * One line of `runs/<runId>/sessions/<sessionId>.jsonl`, append-only and redacted before it is
 * written (secret patterns to `<redacted>`, biometric paths to `<biometric-ref>`). Packet and
 * output bodies are the C7 envelopes, stored here as JSON values. The `end` line is written in a
 * `finally` block, so failed sessions still record the prompt and skill versions they used.
 * `end.noteIds` (SPEC 0005 section 4.3, topology 0004 section 10): the learning notes the writer
 * and director packets carried; optional, so every earlier end line still validates.
 */
export const SessionLineSchema = z.discriminatedUnion('type', [
  z
    .object({
      ...lineBase,
      type: z.literal('start'),
      role: ModelRoleSchema,
      modelId: ModelIdSchema,
      stepKey: StepKeySchema,
      packetType: z.string().regex(/^[A-Z][A-Za-z]{1,63}$/),
    })
    .strict(),
  z.object({ ...lineBase, type: z.literal('packet'), packet: JsonValueSchema }).strict(),
  z
    .object({
      ...lineBase,
      type: z.literal('tool-call'),
      tool: toolName,
      callIndex: z.number().int().min(1),
      input: JsonValueSchema,
    })
    .strict(),
  z
    .object({
      ...lineBase,
      type: z.literal('tool-result'),
      tool: toolName,
      callIndex: z.number().int().min(1),
      outcome: z.enum(['ok', 'error']),
      errorCode: z.string().regex(/^ERROR_[A-Z_]{2,60}$/).nullable(),
      preview: z.string().max(6000),
    })
    .strict(),
  z.object({ ...lineBase, type: z.literal('text'), text: z.string().max(8000) }).strict(),
  z
    .object({
      ...lineBase,
      type: z.literal('usage'),
      callIndex: z.number().int().min(1),
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
      cacheReadTokens: z.number().int().nonnegative().nullable(),
      cacheWriteTokens: z.number().int().nonnegative().nullable(),
    })
    .strict(),
  z.object({ ...lineBase, type: z.literal('output'), output: JsonValueSchema }).strict(),
  z
    .object({
      ...lineBase,
      type: z.literal('end'),
      outcome: SessionOutcomeSchema,
      error: z.string().max(2000).nullable(),
      promptRefs: z.array(AssetRefSchema).max(10),
      skillRefs: z.array(AssetRefSchema).max(10),
      noteIds: z.array(LearningNoteIdSchema).max(64).optional(),
    })
    .strict(),
]);
export type SessionLine = z.infer<typeof SessionLineSchema>;
