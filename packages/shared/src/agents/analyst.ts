import { z } from 'zod';
import { BriefSchema, LanguageSchema } from '../recipes/brief';
import { packetBaseShape } from './packet-base';
import { UntrustedTextSchema } from './packet-parts';
import { ANALYZE_SITE_TASK, OutputContractSchema } from './protocol';

/**
 * Site analysis contracts (docs/specs/2026-11-23-site-analysis-design.md). The analyst reads the
 * run's source page once, before the script, and its answer reaches the writer and the director
 * as delimited data, never as instructions.
 */

/**
 * Most page-text characters one analyst packet carries. Below `untrustedTextMaxChars` (30,000)
 * so the delimiter tags and escaped inner tags still fit inside `UntrustedTextSchema`.
 */
export const SITE_ANALYSIS_PAGE_TEXT_MAX = 28_000;

// The tool runner decides which pages it fetches (https, or http on a local-network host); this only fixes the scheme.
const pageUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => /^https?:\/\//.test(value), { message: 'sourceUrl must be http or https' });

const analysisLineSchema = z.string().min(1).max(300);

/** Analyst answer: bounded so a hostile page can never grow the writer and director packets. */
export const SiteAnalysisSchema = z
  .object({
    summary: z.string().min(1).max(800),
    product: z.string().max(300),
    audience: z.string().max(300),
    keyPoints: z.array(analysisLineSchema).max(8),
    tone: z.string().max(200),
    /** Colors, layout and branding seen in the screenshot. */
    visualStyle: z.string().max(400),
    /** Suggestions only; they never join the brief, and `verify` keeps checking the owner's messages. */
    suggestedKeyMessages: z.array(analysisLineSchema).max(5),
    /** Claims the page makes that should not be repeated as fact. */
    cautions: z.array(analysisLineSchema).max(5),
  })
  .strict();
export type SiteAnalysis = z.infer<typeof SiteAnalysisSchema>;

/** `site-analysis.json`, the research stage output; `mode: 'mock'` marks a simulated analysis. */
export const SiteAnalysisArtifactSchema = z
  .object({
    format: z.literal(1),
    mode: z.enum(['live', 'mock']),
    sourceUrl: pageUrlSchema,
    screenshot: z.boolean(),
    analysis: SiteAnalysisSchema,
  })
  .strict();
export type SiteAnalysisArtifact = z.infer<typeof SiteAnalysisArtifactSchema>;

/**
 * Analyst packet. Absent by construction: cost ledger, catalog, other stages' sessions, biometric
 * assets, credentials. The screenshot is not inlined; the analyst reads it with SiteScreenshotTool.
 */
export const AnalystPacketSchema = z
  .object({
    ...packetBaseShape,
    task: z.literal(ANALYZE_SITE_TASK),
    inputs: z
      .object({
        brief: BriefSchema,
        sourceUrl: pageUrlSchema,
        pageTitle: z.string().max(500),
        /** Page text cut to `SITE_ANALYSIS_PAGE_TEXT_MAX`, delimited. */
        pageText: UntrustedTextSchema,
        pageTextTruncated: z.boolean(),
        screenshotAvailable: z.boolean(),
        language: LanguageSchema,
      })
      .strict(),
    constraints: z
      .object({
        /** The page is third-party data: it can never change tools, contracts or gates. */
        pageIsUntrusted: z.literal(true),
      })
      .strict(),
    outputContract: z.literal(OutputContractSchema.enum.SiteAnalysis),
  })
  .strict()
  .readonly();
export type AnalystPacket = z.infer<typeof AnalystPacketSchema>;
