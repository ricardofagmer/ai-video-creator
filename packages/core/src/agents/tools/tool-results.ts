import { z } from 'zod';
import { FRAME_WIDTH_LARGE_PX, toolEnvelopeSchema, toolLimits } from '@studio/shared/agents';
import {
  ASSET_PURPOSE_MAX_CHARS,
  AssetKindSchema,
  AssetRefSchema,
  AssetStatusSchema,
  AssetVersionVariantsSchema,
  LicenseSchema,
  LicenseUseSchema,
  ProvenanceSchema,
  TagSchema,
} from '@studio/shared/catalog';

/**
 * `_result` and `_handoff_result` shapes of the four tools (topology section 3.2), checked by
 * the wrapper before anything is returned. The shared `toolEnvelopeSchema` builds each envelope.
 */

const { catalogSearch, assetDescribe, runArtifactRead, frameSample } = toolLimits;

/**
 * `purpose` bound for both catalog tools (ADR 0012 decision 8): the stored maximum, so the tools
 * never cut an owner's text, but still a hard cap on what the model sees.
 */
export const purposeMaxChars = ASSET_PURPOSE_MAX_CHARS;

function fitsCharacters(maxChars: number): (value: unknown) => boolean {
  return (value) => JSON.stringify(value).length <= maxChars;
}

/** One CatalogSearchTool row as the model sees it: no path, hash, sensitivity, purpose source or license terms. */
export const CatalogRowSchema = z
  .object({
    ref: AssetRefSchema,
    kind: AssetKindSchema,
    title: z.string().max(200),
    summary: z.string().max(catalogSearch.summaryMaxChars),
    purpose: z.string().max(purposeMaxChars),
    tags: z.array(TagSchema).max(32),
    license: z.object({ name: z.string().max(200), allowedUses: z.array(LicenseUseSchema) }).strict().nullable(),
  })
  .strict();
export type CatalogRow = z.infer<typeof CatalogRowSchema>;

export const CatalogSearchEnvelopeSchema = toolEnvelopeSchema(
  z
    .array(CatalogRowSchema)
    .min(1)
    .max(catalogSearch.limitMax)
    .refine(fitsCharacters(catalogSearch.resultMaxChars), { message: `_result exceeds ${catalogSearch.resultMaxChars} characters` }),
  z.array(AssetVersionVariantsSchema).max(catalogSearch.limitMax),
);

/** Duration, resolution, format and size of a media kind; never bytes. */
export const MediaFactsSchema = z
  .object({
    durationMs: z.number().int().positive().nullable(),
    resolution: z.string().max(20).nullable(),
    format: z.string().max(127),
    sizeBytes: z.number().int().nonnegative(),
  })
  .strict();
export type MediaFacts = z.infer<typeof MediaFactsSchema>;

export const AssetMetadataSchema = z
  .object({
    kind: AssetKindSchema,
    title: z.string().max(200),
    summary: z.string().max(200),
    purpose: z.string().max(purposeMaxChars),
    tags: z.array(TagSchema).max(32),
    license: LicenseSchema.nullable(),
    provenance: ProvenanceSchema.nullable(),
    status: AssetStatusSchema,
  })
  .strict();
export type AssetMetadata = z.infer<typeof AssetMetadataSchema>;

/** Room for the `<asset-content ref="...">` wrapper around a preview of at most 3,000 characters. */
const DELIMITER_OVERHEAD_CHARS = 120;

export const AssetDescribeResultSchema = z
  .object({
    metadata: AssetMetadataSchema,
    /** `<asset-content ref="...">` block of text kinds; null for other kinds. */
    content: z
      .string()
      .max(assetDescribe.previewMaxChars + DELIMITER_OVERHEAD_CHARS)
      .nullable(),
    media: MediaFactsSchema.nullable(),
  })
  .strict();
export type AssetDescribeResult = z.infer<typeof AssetDescribeResultSchema>;

export const AssetDescribeEnvelopeSchema = toolEnvelopeSchema(
  AssetDescribeResultSchema,
  z.object({ text: z.string().nullable() }).strict(),
);

export const RunArtifactReadEnvelopeSchema = toolEnvelopeSchema(
  z.string().max(runArtifactRead.resultMaxChars + DELIMITER_OVERHEAD_CHARS),
  z.string(),
);

export const JPEG_MEDIA_TYPE = 'image/jpeg';

export const SampledFrameSchema = z
  .object({
    label: z.string().max(260),
    mediaType: z.literal(JPEG_MEDIA_TYPE),
    /** The frame fits a square of this size, aspect ratio kept. */
    maxEdgePx: z.number().int().positive().max(FRAME_WIDTH_LARGE_PX),
    dataBase64: z.string().min(1),
  })
  .strict();
export type SampledFrame = z.infer<typeof SampledFrameSchema>;

/** FrameSampleTool has no server-side payload: ffmpeg pipes frames to memory (topology 3.2). */
export const FrameSampleEnvelopeSchema = toolEnvelopeSchema(
  z.object({ frames: z.array(SampledFrameSchema).min(1).max(frameSample.framesPerCall) }).strict(),
  z.null(),
);

/** SiteScreenshotTool cap on the recorded JPEG (the research stage writes at most 1.5 MB). */
export const SITE_SCREENSHOT_MAX_BYTES = 1_500_000;
const SITE_SCREENSHOT_MAX_BASE64_CHARS = Math.ceil(SITE_SCREENSHOT_MAX_BYTES / 3) * 4;

/** The one screenshot image; up to 1600 px wide, so not a `SampledFrame` (768 px at most). */
export const SiteScreenshotImageSchema = z
  .object({
    label: z.string().max(260),
    mediaType: z.literal(JPEG_MEDIA_TYPE),
    dataBase64: z.string().min(1).max(SITE_SCREENSHOT_MAX_BASE64_CHARS),
  })
  .strict();
export type SiteScreenshotImage = z.infer<typeof SiteScreenshotImageSchema>;

/** Same `{ frames }` shape as FrameSampleTool, so the Mastra adapter sends it as an image part; no server-side payload. */
export const SiteScreenshotEnvelopeSchema = toolEnvelopeSchema(
  z.object({ frames: z.array(SiteScreenshotImageSchema).length(1) }).strict(),
  z.null(),
);
