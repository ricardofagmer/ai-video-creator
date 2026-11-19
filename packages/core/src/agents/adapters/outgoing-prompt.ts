import { createAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { type OutgoingPromptMeasure } from './claude-adapter';

/** The language model `@ai-sdk/anthropic` builds; Mastra takes it as the agent's `model`. */
export type AnthropicLanguageModel = ReturnType<ReturnType<typeof createAnthropic>>;

const PartSchema = z
  .object({
    type: z.string(),
    text: z.string().optional(),
    data: z.unknown().optional(),
  })
  .passthrough();

const PromptSchema = z.array(
  z.object({ role: z.string(), content: z.union([z.string(), z.array(PartSchema)]) }).passthrough(),
);

function partMeasure(part: z.infer<typeof PartSchema>): OutgoingPromptMeasure {
  if (part.type === 'file' || part.type === 'image') {
    const data = part.data;
    const bytes = typeof data === 'string' ? data.length : data instanceof Uint8Array ? data.byteLength : 0;
    return { characters: 0, fileParts: 1, fileBytes: bytes };
  }
  if (part.text !== undefined) return { characters: part.text.length, fileParts: 0, fileBytes: 0 };
  // Tool calls and tool results: their serialized size is what leaves.
  return { characters: JSON.stringify(part).length, fileParts: 0, fileBytes: 0 };
}

function add(left: OutgoingPromptMeasure, right: OutgoingPromptMeasure): OutgoingPromptMeasure {
  return {
    characters: left.characters + right.characters,
    fileParts: left.fileParts + right.fileParts,
    fileBytes: left.fileBytes + right.fileBytes,
  };
}

/**
 * Counts what one model call sends, for the egress record and the budget pre-check: text
 * characters and file parts (FrameSampleTool images). Base64 file data is counted as its encoded
 * length. An unreadable prompt is measured by its serialized length, never as zero.
 */
export function measureOutgoingPrompt(prompt: unknown): OutgoingPromptMeasure {
  const parsed = PromptSchema.safeParse(prompt);
  if (!parsed.success) return { characters: JSON.stringify(prompt ?? null).length, fileParts: 0, fileBytes: 0 };
  return parsed.data
    .flatMap((message) => (typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content))
    .map(partMeasure)
    .reduce(add, { characters: 0, fileParts: 0, fileBytes: 0 });
}

/**
 * Wraps the model so `beforeCall` runs before every request of the agent loop, streaming or
 * not. Mastra may drive either method; both are covered. A rejection means nothing is sent.
 */
export function withBeforeCallHook(
  model: AnthropicLanguageModel,
  beforeCall: (prompt: unknown) => Promise<void>,
): AnthropicLanguageModel {
  return {
    specificationVersion: model.specificationVersion,
    provider: model.provider,
    modelId: model.modelId,
    supportedUrls: model.supportedUrls,
    doGenerate: async (options) => {
      await beforeCall(options.prompt);
      return model.doGenerate(options);
    },
    doStream: async (options) => {
      await beforeCall(options.prompt);
      return model.doStream(options);
    },
  };
}
