import { z } from 'zod';
import { AssetKindSchema, AssetRefSchema, TagSchema } from '../catalog/asset-kind';
import { StageIdSchema } from '../run-format/vocabulary';
import { FRAME_WIDTH_LARGE_PX, FRAME_WIDTH_SMALL_PX, toolLimits } from './bounds';
import {
  AgentToolNameSchema,
  CAPTURES_INDEX_ARTIFACT,
  CAPTURE_FRAME_SOURCE,
  CHECKS_ARTIFACT,
  ENVELOPE_PAGINATION_KEY,
  FrameSourceSchema,
  QA_METRICS_ARTIFACT,
  RunArtifactIdSchema,
} from './protocol';

/**
 * Model-facing input schemas of the four read-only tools (topology section 3.2). Every field has a
 * `.describe()` because the description is the only documentation the model sees. `runId`,
 * allowlists and guards are bound server-side at construction and are never inputs.
 */

const fromPagination = `from \`${ENVELOPE_PAGINATION_KEY}\` only`;
const { catalogSearch, frameSample } = toolLimits;

export const CatalogSearchInputSchema = z
  .object({
    kinds: z
      .array(AssetKindSchema)
      .max(AssetKindSchema.options.length)
      .optional()
      .describe('limit to these kinds; omit for all kinds the recipe allows'),
    tags: z.array(TagSchema).max(catalogSearch.tagsMax).optional().describe('AND-matched tags, lowercase'),
    text: z
      .string()
      .max(catalogSearch.textMaxChars)
      .optional()
      .describe('words matched against title, summary, tags; not a sentence'),
    limit: z
      .number()
      .int()
      .min(catalogSearch.limitMin)
      .max(catalogSearch.limitMax)
      .default(catalogSearch.limitDefault)
      .describe(`rows per page, ${catalogSearch.limitMin} to ${catalogSearch.limitMax}; default ${catalogSearch.limitDefault}`),
    cursor: z.string().max(200).optional().describe(fromPagination),
  })
  .strict();
export type CatalogSearchInput = z.infer<typeof CatalogSearchInputSchema>;

export const AssetDescribeInputSchema = z
  .object({
    ref: AssetRefSchema.describe(
      `assetId@version from your packet bindings or a ${AgentToolNameSchema.enum.CatalogSearchTool} result`,
    ),
    offset: z.number().int().min(0).optional().describe(`continue a long text; ${fromPagination}`),
  })
  .strict();
export type AssetDescribeInput = z.infer<typeof AssetDescribeInputSchema>;

export const RunArtifactReadInputSchema = z
  .object({
    artifact: RunArtifactIdSchema.describe('id of the run artifact to read; only ids allowed for your role are served'),
    stageId: StageIdSchema.optional().describe(`for \`${CHECKS_ARTIFACT}\` only`),
    offset: z.number().int().min(0).optional().describe(fromPagination),
  })
  .strict();
export type RunArtifactReadInput = z.infer<typeof RunArtifactReadInputSchema>;

/** Field shape kept apart so consumers can still read `.shape` behind the cross-field refine. */
export const frameSampleInputShape = {
  source: FrameSourceSchema.describe('sample the current run capture or its recorded render'),
  captureId: z
    .string()
    .max(200)
    .optional()
    .describe(`from ${CAPTURES_INDEX_ARTIFACT}; required when source = ${CAPTURE_FRAME_SOURCE}`),
  timestampsMs: z
    .array(z.number().int().min(0))
    .min(frameSample.timestampsMin)
    .max(frameSample.framesPerCall)
    .describe(`ascending; within the duration shown in ${CAPTURES_INDEX_ARTIFACT} or ${QA_METRICS_ARTIFACT}`),
  width: z
    .union([z.literal(FRAME_WIDTH_SMALL_PX), z.literal(FRAME_WIDTH_LARGE_PX)])
    .default(FRAME_WIDTH_LARGE_PX)
    .describe(`frame width in pixels, ${FRAME_WIDTH_SMALL_PX} or ${FRAME_WIDTH_LARGE_PX}; default ${FRAME_WIDTH_LARGE_PX}`),
};

export const FrameSampleInputSchema = z
  .object(frameSampleInputShape)
  .strict()
  .superRefine((input, context) => {
    if (input.source === CAPTURE_FRAME_SOURCE && input.captureId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['captureId'],
        message: `captureId is required when source = ${CAPTURE_FRAME_SOURCE}`,
      });
    }
    if (input.timestampsMs.some((timestamp, index) => index > 0 && timestamp <= (input.timestampsMs[index - 1] ?? -1))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['timestampsMs'], message: 'timestampsMs must be ascending' });
    }
  });
export type FrameSampleInput = z.infer<typeof FrameSampleInputSchema>;
