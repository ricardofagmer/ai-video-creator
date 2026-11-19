import { z } from 'zod';
import {
  ENVELOPE_DSL_KEY,
  ENVELOPE_HANDOFF_RESULT_KEY,
  ENVELOPE_PAGINATION_KEY,
  ENVELOPE_RESULT_KEY,
  ToolErrorCodeSchema,
} from './protocol';

/** Field shape of the shared tool envelope (topology section 3.1). */
export type ToolEnvelopeShape<Result extends z.ZodTypeAny, Handoff extends z.ZodTypeAny> = {
  /** What the tool executed, for tracing only. */
  [ENVELOPE_DSL_KEY]: z.ZodString;
  /** Capped preview the model sees. */
  [ENVELOPE_RESULT_KEY]: Result;
  /** Full payload, server-side only; it never reaches the model. */
  [ENVELOPE_HANDOFF_RESULT_KEY]: Handoff;
  /** Note when the model-visible preview is a page of a larger set. */
  [ENVELOPE_PAGINATION_KEY]: z.ZodOptional<z.ZodString>;
};

/**
 * One envelope schema per tool, from that tool's preview schema and server-side payload schema.
 * A tool with no server-side payload (FrameSampleTool) passes `z.null()`.
 */
export function toolEnvelopeSchema<Result extends z.ZodTypeAny, Handoff extends z.ZodTypeAny>(
  result: Result,
  handoff: Handoff,
): z.ZodObject<ToolEnvelopeShape<Result, Handoff>, 'strict'> {
  const shape: ToolEnvelopeShape<Result, Handoff> = {
    [ENVELOPE_DSL_KEY]: z.string().max(2000),
    [ENVELOPE_RESULT_KEY]: result,
    [ENVELOPE_HANDOFF_RESULT_KEY]: handoff,
    [ENVELOPE_PAGINATION_KEY]: z.string().max(300).optional(),
  };
  return z.object(shape).strict();
}

/**
 * The model-visible preview of a failed call: a typed code plus the actionable hint of topology
 * section 3.2 (`toolErrorHints`), null where the topology gives none.
 */
export const ToolErrorSchema = z
  .object({
    code: ToolErrorCodeSchema,
    hint: z.string().max(300).nullable(),
  })
  .strict();
export type ToolError = z.infer<typeof ToolErrorSchema>;

/** Envelope of a failed call; the model sees the code and hint, never a stack or unredacted stderr. */
export const ToolErrorEnvelopeSchema = toolEnvelopeSchema(ToolErrorSchema, z.null());
export type ToolErrorEnvelope = z.infer<typeof ToolErrorEnvelopeSchema>;
