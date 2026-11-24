import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { ENVELOPE_PAGINATION_KEY, ENVELOPE_RESULT_KEY, type AgentToolName } from '@studio/shared/agents';
import { type JsonValue } from '@studio/shared/run-format';
import { type AgentToolSet } from '../tooling/agent-tool-set';
import { JPEG_MEDIA_TYPE } from './tool-results';
import { withoutModelRunId, type ModelVisibleOutput } from './tool-wrapper';

/**
 * The only file that touches the Mastra tool API (R1-13). Every other file of this folder is
 * plain TypeScript, so a Mastra API change is fixed here alone. API assumptions to confirm at
 * R1-FP against the installed `@mastra/core` 1.x:
 * - `createTool` is exported from `@mastra/core/tools`;
 * - `execute` receives the validated input as its first argument (`(inputData, context)`);
 * - Mastra validates `inputSchema` before `execute`, and a `z.preprocess` schema is shown to the
 *   model as its inner object schema;
 * - `toModelOutput` maps the returned value to the model-facing tool result, with the AI SDK v5
 *   `{ type: 'content', value: [{ type: 'text' } | { type: 'media', data, mediaType }] }` shape;
 * - a `createTool` result is assignable to a `ToolsInput` value.
 */

/** Model-facing tool result content (AI SDK v5 `ToolResultOutput`), as far as these tools use it. */
type ModelContentPart = { readonly type: 'text'; readonly text: string } | { readonly type: 'media'; readonly data: string; readonly mediaType: string };
type ModelToolContent = { readonly type: 'json'; readonly value: JsonValue } | { readonly type: 'content'; readonly value: readonly ModelContentPart[] };

export type ToolResultForm = 'json' | 'images';

export interface MastraToolSpec {
  readonly name: AgentToolName;
  readonly description: string;
  /** The unchanged C7 input schema; the adapter adds only the `runId` override in front of it. */
  readonly inputSchema: z.ZodType<unknown, unknown>;
  /** The guarded wrapper call; it validates the input again, so Mastra's own parse is never trusted. */
  readonly invoke: (input: unknown) => Promise<ModelVisibleOutput>;
  readonly resultForm: ToolResultForm;
}

/**
 * The image fields FrameSampleTool frames and the SiteScreenshotTool image share; other fields
 * (a frame's `maxEdgePx`) are dropped. Each tool's own envelope schema already checked the result.
 */
const ImagePartSchema = z.object({ label: z.string(), mediaType: z.literal(JPEG_MEDIA_TYPE), dataBase64: z.string().min(1) });
const FramesResultSchema = z.object({ frames: z.array(ImagePartSchema) });

function asJson(output: ModelVisibleOutput): JsonValue {
  const pagination = output[ENVELOPE_PAGINATION_KEY];
  return pagination === undefined
    ? { [ENVELOPE_RESULT_KEY]: output[ENVELOPE_RESULT_KEY] }
    : { [ENVELOPE_RESULT_KEY]: output[ENVELOPE_RESULT_KEY], [ENVELOPE_PAGINATION_KEY]: pagination };
}

/** Frames and screenshots reach the model as image parts with their labels; anything else (an error envelope) as JSON. */
function imageContent(output: ModelVisibleOutput): ModelToolContent {
  const frames = FramesResultSchema.safeParse(output[ENVELOPE_RESULT_KEY]);
  if (!frames.success) return { type: 'json', value: asJson(output) };
  return {
    type: 'content',
    value: frames.data.frames.flatMap((frame): ModelContentPart[] => [
      { type: 'text', text: frame.label },
      { type: 'media', data: frame.dataBase64, mediaType: frame.mediaType },
    ]),
  };
}

/** Wraps one guarded tool as a Mastra tool; `execute` delegates to the wrapper and nothing else. */
export function toMastraTool(spec: MastraToolSpec): AgentToolSet[string] {
  const base = {
    id: spec.name,
    description: spec.description,
    // Topology 3.2: a model-supplied runId is dropped before Mastra's validation, so it is ignored, never an error.
    inputSchema: z.preprocess(withoutModelRunId, spec.inputSchema),
    execute: async (inputData: unknown): Promise<ModelVisibleOutput> => spec.invoke(inputData),
  };
  return spec.resultForm === 'images' ? createTool({ ...base, toModelOutput: imageContent }) : createTool(base);
}
